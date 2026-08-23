import fs from 'node:fs';
import readline from 'node:readline';
import { Writable } from 'node:stream';

import { eq } from 'drizzle-orm';

import { hashPassword, passwordProblem } from '../auth/passwords.js';
import { db, sqlite } from '../db/index.js';
import { teams, users } from '../db/schema.js';
import { createTeam } from '../repositories/teams.js';

/**
 * Заведение аккаунта с сервера.
 *
 * Регистрации через интернет нет намеренно: пользователей двое, поток
 * приглашений им не нужен, а публичный эндпоинт регистрации — это класс
 * уязвимостей, которого можно просто не иметь.
 */

/**
 * Пароль вводится без эха и никогда не приходит аргументом: аргументы видны
 * в списке процессов и оседают в истории оболочки.
 */
/**
 * Ввод пароля.
 *
 * Два пути намеренно. С клавиатуры — readline с погашенным эхом, чтобы
 * пароль не остался на экране. Из конвейера — поток читается целиком и
 * разбирается по строкам: readline на неинтерактивном потоке разбирал
 * строки не по порядку, и проверка совпадения падала на верном вводе.
 *
 * Аргументом пароль не принимается ни в каком виде: аргументы видны в
 * списке процессов и оседают в истории оболочки.
 */
function makePasswordReader(): (question: string) => Promise<string> {
  if (!process.stdin.isTTY) {
    const piped = fs.readFileSync(0, 'utf8').split('\n');
    let index = 0;
    return (question) => {
      process.stdout.write(`${question}\n`);
      return Promise.resolve((piped[index++] ?? '').trim());
    };
  }

  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });

  return (question) => {
    process.stdout.write(question);
    return new Promise((resolve) => {
      rl.question('', (answer) => {
        process.stdout.write('\n');
        resolve(answer.trim());
      });
    });
  };
}

const askHidden = makePasswordReader();

/** Разбор `--ключ значение`. */
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const email = (arg('email') ?? '').trim().toLowerCase();
  const name = (arg('name') ?? '').trim();

  if (!email.includes('@') || !name) {
    console.error('Использование: npm run user:add -- --email почта --name имя');
    process.exit(1);
  }

  if (db.select().from(users).where(eq(users.email, email)).get()) {
    console.error('Такой пользователь уже есть.');
    process.exit(1);
  }

  const password = await askHidden('Пароль: ');
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  if ((await askHidden('Пароль ещё раз: ')) !== password) {
    console.error('Пароли не совпали.');
    process.exit(1);
  }

  const user = db
    .insert(users)
    .values({ email, name, passwordHash: hashPassword(password) })
    .returning()
    .get();

  // Команды, оставшиеся без владельца от одиночной версии, достаются
  // первому заведённому аккаунту — иначе прежние данные оказались бы
  // ничьими и невидимыми.
  //
  // Сырым SQL намеренно: в схеме owner_id объявлен notNull, потому что для
  // всего работающего кода он обязателен. Строки без владельца существуют
  // ровно один момент — между миграцией и первым аккаунтом, — и обращаться
  // к ним через типизированный слой значило бы врать типам ради разовой
  // операции.
  const orphans = sqlite
    .prepare('UPDATE teams SET owner_id = ? WHERE owner_id IS NULL')
    .run(user.id);
  if (orphans.changes > 0) {
    console.log(`Перешло к тебе команд: ${orphans.changes}`);
  }

  const own = db.select().from(teams).where(eq(teams.ownerId, user.id)).all();
  if (own.length === 0) {
    const team = createTeam({ name: 'Моя команда' }, user.id);
    console.log(`Создана команда «${team.name}».`);
  }

  const active = db.select().from(teams).where(eq(teams.ownerId, user.id)).all()[0];
  db.update(users).set({ activeTeamId: active?.id ?? null }).where(eq(users.id, user.id)).run();

  console.log(`Готово: ${name} <${email}>`);
}

void main();
