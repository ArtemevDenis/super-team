import fs from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import { backupsDir } from './paths.js';

const KEEP_BACKUPS = 30;

/**
 * Снимок базы при старте сервера.
 *
 * Делается через `VACUUM INTO`, а не копированием файла. При журнале WAL
 * свежие транзакции лежат в отдельном `-wal`, и обычный copy забирает лишь
 * основной файл: проверка показала, что такая «копия» содержала 0 оценок
 * вместо 220 — то есть бэкап был пустым ровно там, где он нужен.
 *
 * VACUUM INTO просит саму SQLite собрать согласованный снимок, включая всё
 * из WAL, и записать его одним файлом.
 */
export function backupDatabase(sqlite: BetterSqlite3.Database, today: string): void {
  fs.mkdirSync(backupsDir, { recursive: true });

  const target = path.join(backupsDir, `${today}.db`);
  // VACUUM INTO отказывается писать в существующий файл — за день делаем
  // один снимок, этого достаточно.
  if (!fs.existsSync(target)) {
    try {
      sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    } catch (error) {
      // Не валим запуск из-за бэкапа, но и не молчим: незамеченная поломка
      // здесь означает, что защиты нет, а кажется, что есть.
      console.error('Не удалось сделать бэкап базы:', error);
      return;
    }
  }

  const stale = fs
    .readdirSync(backupsDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.db$/.test(name))
    .sort()
    .slice(0, -KEEP_BACKUPS);

  for (const name of stale) {
    fs.rmSync(path.join(backupsDir, name), { force: true });
  }
}
