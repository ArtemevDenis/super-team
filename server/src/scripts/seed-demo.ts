import { eq } from 'drizzle-orm';

import { runWithContext } from '../auth/context.js';
import { hashPassword } from '../auth/passwords.js';
import { db } from '../db/index.js';
import { seed } from '../db/seed.js';
import { teams, users } from '../db/schema.js';
import { createTeam } from '../repositories/teams.js';

/**
 * Демо-аккаунт: демонстрационный вход с выдуманными данными.
 *
 * Скрипт идемпотентен и рассчитан на повторный запуск: пароль публичный,
 * а значит рано или поздно в демо кто-нибудь наведёт порядок по-своему.
 * Одна команда возвращает его в исходное состояние.
 *
 * Длина пароля не проверяется намеренно — passwordProblem защищает живые
 * аккаунты, а смысл этого в том, чтобы его знали все. Сам по себе короткий
 * пароль здесь не риск: демо изолировано от других аккаунтов той же
 * проверкой владения, что и любая другая команда, и не даёт никаких прав
 * за своими пределами.
 */
const EMAIL = 'demo@artden.ru';
const PASSWORD = 'demo';
const NAME = 'Демо';

function main(): void {
  const existing = db.select().from(users).where(eq(users.email, EMAIL)).get();

  const user =
    existing ??
    db
      .insert(users)
      .values({
        email: EMAIL,
        name: NAME,
        passwordHash: hashPassword(PASSWORD),
        isDemo: true,
      })
      .returning()
      .get();

  // Пароль и флаг переставляются и при повторном запуске: если демо кто-то
  // успел изменить, команда должна возвращать его в известное состояние.
  if (existing) {
    db.update(users)
      .set({ passwordHash: hashPassword(PASSWORD), isDemo: true, name: NAME })
      .where(eq(users.id, user.id))
      .run();
  }

  const team =
    db.select().from(teams).where(eq(teams.ownerId, user.id)).all()[0] ??
    createTeam({ name: 'Продуктовая команда' }, user.id);

  db.update(users).set({ activeTeamId: team.id }).where(eq(users.id, user.id)).run();

  // Сид работает через currentTeamId(), поэтому его нужно запускать в том же
  // контексте, что и обычный запрос — иначе он не знает, чью команду наполняет.
  //
  // И целиком в транзакции: сид сначала вычищает команду, а потом наполняет
  // её заново. Падение посередине оставило бы демо пустым — то есть неудачная
  // попытка обновить его была бы разрушительнее, чем ничего не делать.
  runWithContext({ userId: user.id, teamId: team.id }, () => {
    db.transaction(() => seed(team.id));
  });

  console.log(`\nДемо готово: ${EMAIL} / ${PASSWORD}`);
}

main();
