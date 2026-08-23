import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqlite } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../drizzle');

/**
 * Свой раннер вместо drizzle-orm/migrator: единственный пользователь, база
 * локальная, а собственные VIEW всё равно пришлось бы применять отдельно.
 */
function run(): void {
  if (!fs.existsSync(migrationsDir)) {
    console.error(
      'Папки drizzle/ нет — сначала сгенерируй миграцию: npx drizzle-kit generate',
    );
    process.exit(1);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    sqlite
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const pending = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const sqlText = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    // drizzle-kit разделяет утверждения этим маркером
    const statements = sqlText
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    // Команда по умолчанию должна существовать до того, как на неё
    // сошлются строки, перенесённые из бесколандной эпохи.
    if (name.includes('0004')) ensureDefaultTeamTable();

    sqlite.transaction(() => {
      for (const statement of statements) sqlite.exec(statement);
      sqlite
        .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
        .run(name, new Date().toISOString());
    })();

    console.log(`применена ${name}`);
  }

  applyViews();

  // Наборы по умолчанию больше не досеиваются здесь.
  //
  // Раньше это работало, потому что «текущая команда» была свойством
  // сервера и существовала всегда. Теперь она принадлежит пользователю,
  // а на момент миграции ни одного пользователя может не быть. Категории,
  // грейды и атрибуты заводит createTeam — то есть ровно тогда, когда
  // появляется команда, которой они принадлежат.

  console.log(pending.length ? 'миграции применены' : 'миграций нет');
}

/**
 * Всё, что было заведено до появления команд, принадлежит первой из них.
 * Колонки добавлены со значением по умолчанию 1, поэтому достаточно
 * убедиться, что команда с этим идентификатором существует.
 */
function ensureDefaultTeamTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      color text DEFAULT '#6366f1' NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      created_at text NOT NULL,
      updated_at text NOT NULL
    );
  `);

  const existing = sqlite
    .prepare('SELECT id FROM teams ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined;
  if (existing) return;

  // Команда по умолчанию нужна только там, где есть данные из эпохи до
  // команд: им требуется хозяин. На чистой базе таких строк нет, и создавать
  // её здесь значило бы плодить пустую команду без владельца — она не видна
  // ни одному пользователю и только мешается в базе.
  const legacyPeople = sqlite
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='people'")
    .get() as { n: number };
  if (legacyPeople.n === 0) return;

  const peopleCount = sqlite.prepare('SELECT COUNT(*) AS n FROM people').get() as {
    n: number;
  };
  if (peopleCount.n === 0) return;

  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO teams (id, name, color, sort_order, created_at, updated_at) VALUES (1, ?, ?, 0, ?, ?)',
    )
    .run('Моя команда', '#6366f1', now, now);

  console.log('заведена команда по умолчанию');
}

/**
 * VIEW пересоздаются каждый раз: они выводятся из схемы, версионировать их
 * отдельно смысла нет.
 */
function applyViews(): void {
  sqlite.exec(`
    DROP VIEW IF EXISTS active_people;
    CREATE VIEW active_people AS
      SELECT * FROM people WHERE status = 'active';

    DROP VIEW IF EXISTS current_attribute_values;
    CREATE VIEW current_attribute_values AS
      SELECT person_id, attribute_id, value, confidence, evidence, assessed_at
      FROM (
        SELECT
          person_id, attribute_id, value, confidence, evidence, assessed_at,
          ROW_NUMBER() OVER (
            PARTITION BY person_id, attribute_id
            ORDER BY assessed_at DESC, id DESC
          ) AS rn
        FROM assessments
      )
      WHERE rn = 1;
  `);
}

run();
