import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * И src/db, и dist/db лежат ровно на два уровня ниже server/, поэтому один
 * и тот же подъём работает и под tsx, и после сборки.
 */
const repoRoot = path.resolve(here, '../../..');

export const dataDir = process.env.DATA_DIR ?? path.join(repoRoot, 'data');
export const dbPath = process.env.DB_PATH ?? path.join(dataDir, 'team.db');
export const backupsDir = path.join(dataDir, 'backups');
export const photosDir = path.join(dataDir, 'photos');
export const clientDistDir = path.join(repoRoot, 'client', 'dist');
