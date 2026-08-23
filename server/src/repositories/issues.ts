import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { issues, people } from '../db/schema.js';
import { nowTs, today, type DayType } from '../domain/dates.js';
import { summarizeIssues, type IssueSummaryType } from '../domain/issues.js';
import { currentTeamId } from './teams.js';

export type IssueRowType = typeof issues.$inferSelect;

/** Принадлежит ли человек текущей команде — иначе id из чужой команды пройдёт. */
function ownsPerson(personId: number): boolean {
  return Boolean(
    db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, personId), eq(people.teamId, currentTeamId())))
      .get(),
  );
}

export function listIssues(personId: number): IssueRowType[] {
  if (!ownsPerson(personId)) return [];
  return db
    .select()
    .from(issues)
    .where(eq(issues.personId, personId))
    .orderBy(desc(issues.happenedAt), desc(issues.id))
    .all();
}

export function issueSummary(personId: number): IssueSummaryType {
  return summarizeIssues(listIssues(personId), today());
}

export function createIssue(input: {
  personId: number;
  description: string;
  happenedAt?: DayType;
  discussedAt?: DayType | null;
  oneOnOneId?: number | null;
}): IssueRowType | null {
  if (!ownsPerson(input.personId)) return null;

  return db
    .insert(issues)
    .values({
      personId: input.personId,
      description: input.description,
      happenedAt: input.happenedAt ?? today(),
      discussedAt: input.discussedAt ?? null,
      oneOnOneId: input.oneOnOneId ?? null,
    })
    .returning()
    .get();
}

/**
 * Правка записи.
 *
 * discussedAt приходит явным значением, в том числе null: отметку о
 * разговоре нужно уметь снять. Поставил по ошибке не тому — и без снятия
 * пришлось бы удалять запись целиком, теряя сам факт.
 */
export function updateIssue(
  id: number,
  input: { description?: string; happenedAt?: DayType; discussedAt?: DayType | null },
): IssueRowType | null {
  const existing = db.select().from(issues).where(eq(issues.id, id)).get();
  if (!existing || !ownsPerson(existing.personId)) return null;

  return (
    db
      .update(issues)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(issues.id, id))
      .returning()
      .get() ?? null
  );
}

export function removeIssue(id: number): boolean {
  const existing = db.select().from(issues).where(eq(issues.id, id)).get();
  if (!existing || !ownsPerson(existing.personId)) return false;

  db.delete(issues).where(eq(issues.id, id)).run();
  return true;
}

/** Непроговорённые по всей команде — вход для сигнала на панели. */
export function undiscussedByPerson(): Map<number, IssueRowType[]> {
  const rows = db
    .select({
      id: issues.id,
      personId: issues.personId,
      description: issues.description,
      happenedAt: issues.happenedAt,
      discussedAt: issues.discussedAt,
      oneOnOneId: issues.oneOnOneId,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .innerJoin(people, eq(issues.personId, people.id))
    .where(and(eq(people.teamId, currentTeamId()), eq(people.status, 'active')))
    .all();

  const byPerson = new Map<number, IssueRowType[]>();
  for (const row of rows) {
    if (row.discussedAt !== null) continue;
    byPerson.set(row.personId, [...(byPerson.get(row.personId) ?? []), row]);
  }
  return byPerson;
}
