import fs from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { photosDir } from '../db/paths.js';
import { people } from '../db/schema.js';
import { nowTs } from '../domain/dates.js';

/** Клиент присылает уже сжатый квадрат, поэтому потолок маленький. */
const MAX_BYTES = 1_500_000;

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const DATA_URL = /^data:([\w/+.-]+);base64,(.+)$/s;

export type PhotoResultType = { photoPath: string };

/**
 * Имя файла генерируется здесь и никогда не берётся от клиента: присланное
 * имя вида `../../db/team.db` записало бы файл мимо папки с фотографиями.
 */
export function savePhoto(personId: number, dataUrl: string): PhotoResultType {
  const match = DATA_URL.exec(dataUrl);
  if (!match) {
    throw Object.assign(new Error('Ожидается изображение в формате data URL'), {
      status: 400,
    });
  }

  const [, mime, base64] = match;
  const extension = ALLOWED.get(mime ?? '');
  if (!extension) {
    throw Object.assign(new Error('Поддерживаются JPEG, PNG и WebP'), {
      status: 400,
    });
  }

  const buffer = Buffer.from(base64 ?? '', 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    throw Object.assign(new Error('Файл пустой или слишком большой'), {
      status: 400,
    });
  }

  fs.mkdirSync(photosDir, { recursive: true });

  // Имя со штампом времени, а не просто id: браузер иначе показывал бы
  // старую картинку из кэша после замены.
  const fileName = `${personId}-${Date.now()}.${extension}`;
  fs.writeFileSync(path.join(photosDir, fileName), buffer);

  const previous = db
    .select({ photoPath: people.photoPath })
    .from(people)
    .where(eq(people.id, personId))
    .get();

  db.update(people)
    .set({ photoPath: fileName, updatedAt: nowTs() })
    .where(eq(people.id, personId))
    .run();

  removeFile(previous?.photoPath ?? null);

  return { photoPath: fileName };
}

export function deletePhoto(personId: number): void {
  const current = db
    .select({ photoPath: people.photoPath })
    .from(people)
    .where(eq(people.id, personId))
    .get();

  db.update(people)
    .set({ photoPath: null, updatedAt: nowTs() })
    .where(eq(people.id, personId))
    .run();

  removeFile(current?.photoPath ?? null);
}

function removeFile(fileName: string | null): void {
  if (!fileName) return;

  // Ещё одна страховка от выхода за папку: в базе могло оказаться что угодно.
  const safe = path.basename(fileName);
  fs.rmSync(path.join(photosDir, safe), { force: true });
}
