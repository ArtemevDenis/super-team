import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop()!, { recursive: true, force: true });
});

/**
 * Регрессия на пустой бэкап.
 *
 * Первая версия копировала файл базы через fs.copyFileSync. При журнале WAL
 * свежие транзакции лежат в отдельном `-wal`, и такая копия содержала ноль
 * оценок вместо двухсот двадцати: механизм, защищающий все данные, не
 * защищал ничего.
 */
describe('снимок базы при журнале WAL', () => {
  function seedDatabase(dir: string) {
    const dbPath = path.join(dir, 'team.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE assessments (id INTEGER PRIMARY KEY, value INTEGER)');

    const insert = db.prepare('INSERT INTO assessments (value) VALUES (?)');
    const many = db.transaction(() => {
      for (let i = 0; i < 220; i += 1) insert.run(i);
    });
    many();

    return { db, dbPath };
  }

  it('копирование файла теряет всё, что лежит в журнале', () => {
    const dir = tempDir();
    const { dbPath } = seedDatabase(dir);

    const naive = path.join(dir, 'naive.db');
    fs.copyFileSync(dbPath, naive);

    const copy = new Database(naive, { readonly: true });
    const tables = copy
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();

    // В журнале остаётся не только содержимое, но и сама схема: в такой
    // «копии» нет даже таблицы, не то что двухсот двадцати оценок.
    expect(tables).toEqual([]);
  });

  it('VACUUM INTO забирает всё, включая незаписанное в основной файл', () => {
    const dir = tempDir();
    const { db } = seedDatabase(dir);

    const target = path.join(dir, 'backup.db');
    db.exec(`VACUUM INTO '${target}'`);

    const copy = new Database(target, { readonly: true });
    const count = copy.prepare('SELECT count(*) c FROM assessments').get() as {
      c: number;
    };

    expect(count.c).toBe(220);
  });
});
