import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';

import { currentContext } from '../auth/context.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { sanitizeForPresentation } from '../domain/sanitize.js';
import { nowTs } from '../domain/dates.js';

/**
 * Флаг хранится в базе, а не в памяти процесса.
 *
 * Перезапуск сервера посреди созвона не должен молча снимать защиту:
 * застрять в безопасном режиме — неудобно, случайно из него выпасть —
 * необратимо. Поэтому режим переживает рестарт, а интерфейс всё время
 * показывает, что он включён.
 *
 * И он принадлежит пользователю, а не серверу. Когда флаг был общим, один
 * включал «шарю экран» — и у второго молча пропадали заметки; хуже
 * обратное: выключив после своего созвона, ты снимал защиту с чужого
 * экрана посреди чужого созвона.
 */
export function isPresentationMode(): boolean {
  const context = currentContext();
  if (!context) return false;

  const user = db
    .select({ presentationMode: users.presentationMode })
    .from(users)
    .where(eq(users.id, context.userId))
    .get();

  return user?.presentationMode ?? false;
}

export function setPresentationMode(enabled: boolean, userId: number): void {
  db.update(users)
    .set({ presentationMode: enabled, updatedAt: nowTs() })
    .where(eq(users.id, userId))
    .run();
}

/** Пути, которые обязаны отвечать честно даже при включённом режиме. */
const BYPASS = new Set(['/presentation-mode']);

/**
 * Обёртка над res.json вместо вызовов санитайзера в каждом обработчике.
 * Так новый метод попадает под правила автоматически — забыть добавить
 * проверку в свежий роут физически невозможно.
 */
export function presentationModeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (BYPASS.has(req.path)) return next();

  const original = res.json.bind(res);
  res.json = (body: unknown) =>
    original(isPresentationMode() ? sanitizeForPresentation(body) : body);

  next();
}
