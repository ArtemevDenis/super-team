import fs from 'node:fs';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { today } from '../domain/dates.js';
import { backupDatabase } from './backup.js';
import { dataDir, dbPath, photosDir } from './paths.js';
import * as schema from './schema.js';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(photosDir, { recursive: true });

export const sqlite = new Database(dbPath);

// better-sqlite3 не включает внешние ключи сам, а вся схема построена на них:
// без этой строки каскады не работают и висячие ссылки копятся молча.
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');

// Бэкап делается уже открытым соединением: при WAL снимок должен собирать
// сама SQLite, иначе в него не попадёт ничего из журнала.
backupDatabase(sqlite, today());

export const db = drizzle(sqlite, { schema });
export { schema };
