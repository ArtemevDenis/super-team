import { and, asc, eq, inArray, isNotNull, min } from 'drizzle-orm';

import { requireContext } from '../auth/context.js';
import { db } from '../db/index.js';
import { todos } from '../db/schema.js';
import { nowTs, type DayType } from '../domain/dates.js';

export type TodoRowType = typeof todos.$inferSelect;

const mine = () => eq(todos.userId, requireContext().userId);

export function listTodos(): TodoRowType[] {
  return db.select().from(todos).where(mine()).orderBy(asc(todos.position), asc(todos.id)).all();
}

/** Новое дело встаёт наверх: только что пришедшее в голову обычно и самое свежее. */
export function createTodo(input: { title: string; dueAt?: DayType | null }): TodoRowType {
  const top = db.select({ value: min(todos.position) }).from(todos).where(mine()).get();

  return db
    .insert(todos)
    .values({
      userId: requireContext().userId,
      title: input.title,
      dueAt: input.dueAt ?? null,
      position: (top?.value ?? 1) - 1,
    })
    .returning()
    .get();
}

export function updateTodo(
  id: number,
  input: { title?: string; dueAt?: DayType | null; done?: boolean },
): TodoRowType | null {
  const { done, ...fields } = input;
  const completedAt = done === undefined ? {} : { completedAt: done ? nowTs() : null };

  return (
    db
      .update(todos)
      .set({ ...fields, ...completedAt, updatedAt: nowTs() })
      .where(and(eq(todos.id, id), mine()))
      .returning()
      .get() ?? null
  );
}

export function removeTodo(id: number): boolean {
  return db.delete(todos).where(and(eq(todos.id, id), mine())).run().changes > 0;
}

export function clearCompleted(): number {
  return db.delete(todos).where(and(mine(), isNotNull(todos.completedAt))).run().changes;
}

/**
 * Порядок приходит списком id целиком. Чужие id отсекает условие на
 * владельца, а не проверка заранее: так подмена id в запросе просто
 * ничего не меняет.
 */
export function reorderTodos(ids: readonly number[]): void {
  db.transaction((tx) => {
    const owned = new Set(
      tx
        .select({ id: todos.id })
        .from(todos)
        .where(and(mine(), inArray(todos.id, [...ids])))
        .all()
        .map((row) => row.id),
    );

    ids
      .filter((id) => owned.has(id))
      .forEach((id, position) => {
        tx.update(todos).set({ position }).where(eq(todos.id, id)).run();
      });
  });
}
