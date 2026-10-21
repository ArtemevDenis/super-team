import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  climateCheckins,
  commitments,
  karmaEntries,
  oneOnOnes,
  people,
} from '../db/schema.js';
import { addDays, nowTs, today, type DayType } from '../domain/dates.js';
import { currentTeamId, teamPersonIds } from './teams.js';

export type OneOnOneType = typeof oneOnOnes.$inferSelect;
export type CommitmentType = typeof commitments.$inferSelect;
export type ClimateCheckinRowType = typeof climateCheckins.$inferSelect;
export type KarmaEntryType = typeof karmaEntries.$inferSelect;

/* ------------------------------- чтение ------------------------------- */

export function listOneOnOnes(personId: number): OneOnOneType[] {
  return db
    .select()
    .from(oneOnOnes)
    .where(eq(oneOnOnes.personId, personId))
    .orderBy(desc(oneOnOnes.happenedAt), desc(oneOnOnes.plannedAt))
    .all();
}

export function getLastDoneOneOnOne(personId: number): OneOnOneType | null {
  return (
    db
      .select()
      .from(oneOnOnes)
      .where(
        and(
          eq(oneOnOnes.personId, personId),
          eq(oneOnOnes.status, 'done'),
          isNotNull(oneOnOnes.happenedAt),
        ),
      )
      .orderBy(desc(oneOnOnes.happenedAt), desc(oneOnOnes.id))
      .get() ?? null
  );
}

export function getNextPlanned(personId: number): OneOnOneType | null {
  return (
    db
      .select()
      .from(oneOnOnes)
      .where(
        and(eq(oneOnOnes.personId, personId), eq(oneOnOnes.status, 'planned')),
      )
      .orderBy(oneOnOnes.plannedAt)
      .get() ?? null
  );
}



export function listOpenCommitments(personId?: number): CommitmentType[] {
  const condition = personId
    ? and(eq(commitments.status, 'open'), eq(commitments.personId, personId))
    : and(eq(commitments.status, 'open'), inArray(commitments.personId, teamPersonIds()));

  return db
    .select()
    .from(commitments)
    .where(condition)
    .orderBy(commitments.dueAt)
    .all();
}

/** Открытые обещания лида по активной команде — для виджета, с именем человека. */
export function listMyOpenCommitments() {
  return db
    .select({
      id: commitments.id,
      personId: commitments.personId,
      personName: people.fullName,
      title: commitments.title,
      dueAt: commitments.dueAt,
    })
    .from(commitments)
    .innerJoin(people, eq(commitments.personId, people.id))
    .where(
      and(
        eq(people.teamId, currentTeamId()),
        eq(commitments.direction, 'i_owe'),
        eq(commitments.status, 'open'),
      ),
    )
    .orderBy(commitments.dueAt, commitments.id)
    .all();
}

export function listCommitments(personId: number): CommitmentType[] {
  return db
    .select()
    .from(commitments)
    .where(eq(commitments.personId, personId))
    .orderBy(desc(commitments.createdAt))
    .all();
}

export function listCheckins(personId: number): ClimateCheckinRowType[] {
  return db
    .select()
    .from(climateCheckins)
    .where(eq(climateCheckins.personId, personId))
    .orderBy(desc(climateCheckins.measuredAt), desc(climateCheckins.id))
    .all();
}


export function listKarma(personId?: number): KarmaEntryType[] {
  const query = db.select().from(karmaEntries);
  const rows = personId
    ? query.where(eq(karmaEntries.personId, personId)).all()
    : query.where(inArray(karmaEntries.personId, teamPersonIds())).all();
  return rows.sort((a, b) => (a.happenedAt < b.happenedAt ? 1 : -1));
}

/**
 * Сколько запланированных встреч подряд было пропущено. Считается от самой
 * свежей назад: пропуск — самостоятельный сигнал, а не отсутствие данных.
 */
export function skippedStreak(personId: number): number {
  const recent = db
    .select({ status: oneOnOnes.status })
    .from(oneOnOnes)
    .where(
      and(eq(oneOnOnes.personId, personId), ne(oneOnOnes.status, 'planned')),
    )
    .orderBy(desc(oneOnOnes.happenedAt), desc(oneOnOnes.id))
    .limit(5)
    .all();

  let streak = 0;
  for (const row of recent) {
    if (row.status !== 'skipped') break;
    streak += 1;
  }
  return streak;
}

/* ------------------------------- запись ------------------------------- */

export type SaveOneOnOneInputType = {
  personId: number;
  /** id заранее запланированной встречи, если проводим именно её. */
  oneOnOneId?: number | null;
  happenedAt: DayType;
  agenda?: string | null;
  notes?: string | null;
  isSensitive?: boolean;
  durationMinutes?: number | null;
  climate?: {
    motivation: number;
    workloadPressure: number;
    satisfaction: number;
  } | null;
  /** Отметки по уже существующим обязательствам прямо из формы. */
  commitmentUpdates?: readonly {
    id: number;
    status: 'done' | 'cancelled' | 'snoozed' | 'open';
    snoozedUntil?: DayType | null;
  }[];
  newCommitments?: readonly {
    direction: 'i_owe' | 'they_owe';
    title: string;
    details?: string | null;
    dueAt?: DayType | null;
  }[];
  karma?: readonly {
    category: string;
    description: string;
  }[];
  /** null — не планировать следующую; undefined — оставить как есть. */
  nextPlannedAt?: DayType | null;
};

/**
 * Всё сохранение встречи — одна транзакция. Частично записанный 1-1 (заметки
 * есть, отметки по обязательствам нет) хуже, чем несохранённый: он выглядит
 * достоверным и молча теряет договорённости.
 */
export function saveOneOnOne(input: SaveOneOnOneInputType): OneOnOneType {
  return db.transaction((tx) => {
    const meetingValues = {
      personId: input.personId,
      happenedAt: input.happenedAt,
      status: 'done' as const,
      agenda: input.agenda ?? null,
      notes: input.notes ?? null,
      isSensitive: input.isSensitive ?? false,
      durationMinutes: input.durationMinutes ?? null,
      updatedAt: nowTs(),
    };

    const meeting = input.oneOnOneId
      ? tx
          .update(oneOnOnes)
          .set(meetingValues)
          .where(and(eq(oneOnOnes.id, input.oneOnOneId), eq(oneOnOnes.personId, input.personId)))
          .returning()
          .get()
      : tx.insert(oneOnOnes).values(meetingValues).returning().get();

    if (input.climate) {
      tx.insert(climateCheckins)
        .values({
          personId: input.personId,
          oneOnOneId: meeting.id,
          measuredAt: input.happenedAt,
          ...input.climate,
        })
        .run();
    }

    if (!meeting) {
      throw Object.assign(new Error('Встреча не найдена'), { status: 404 });
    }

    // Обещания отмечаются только этого человека: id приходят из формы, и
    // без условия на personId чужое закрывалось бы подменой одного числа.
    for (const update of input.commitmentUpdates ?? []) {
      tx.update(commitments)
        .set({
          status: update.status,
          completedAt: update.status === 'done' ? input.happenedAt : null,
          snoozedUntil: update.snoozedUntil ?? null,
          updatedAt: nowTs(),
        })
        .where(and(eq(commitments.id, update.id), eq(commitments.personId, input.personId)))
        .run();
    }

    for (const fresh of input.newCommitments ?? []) {
      tx.insert(commitments)
        .values({
          personId: input.personId,
          oneOnOneId: meeting.id,
          direction: fresh.direction,
          title: fresh.title,
          details: fresh.details ?? null,
          dueAt: fresh.dueAt ?? null,
        })
        .run();
    }

    for (const entry of input.karma ?? []) {
      tx.insert(karmaEntries)
        .values({
          personId: input.personId,
          oneOnOneId: meeting.id,
          category: entry.category,
          description: entry.description,
          happenedAt: input.happenedAt,
        })
        .run();
    }

    if (input.nextPlannedAt !== undefined) {
      // Ровно одна запланированная встреча на человека: две «следующие»
      // превращают блок ближайших в мусор.
      tx.delete(oneOnOnes)
        .where(
          and(
            eq(oneOnOnes.personId, input.personId),
            eq(oneOnOnes.status, 'planned'),
          ),
        )
        .run();

      if (input.nextPlannedAt) {
        tx.insert(oneOnOnes)
          .values({
            personId: input.personId,
            plannedAt: input.nextPlannedAt,
            status: 'planned',
          })
          .run();
      }
    }

    return meeting;
  });
}

/**
 * Путь на одну секунду: отметить, что встреча была, не заполняя ничего.
 * Фактически верная пустая запись лучше пропущенной — иначе каденция
 * начинает врать, и врать будет уже навсегда.
 */
export function quickMarkDone(personId: number): OneOnOneType {
  const person = db.select().from(people).where(eq(people.id, personId)).get();
  const day = today();

  return saveOneOnOne({
    personId,
    happenedAt: day,
    nextPlannedAt: addDays(day, person?.cadenceDays ?? 14),
  });
}

export function markSkipped(oneOnOneId: number): OneOnOneType | null {
  return (
    db
      .update(oneOnOnes)
      .set({ status: 'skipped', happenedAt: today(), updatedAt: nowTs() })
      .where(eq(oneOnOnes.id, oneOnOneId))
      .returning()
      .get() ?? null
  );
}

export function planOneOnOne(personId: number, plannedAt: DayType): OneOnOneType {
  return db.transaction((tx) => {
    tx.delete(oneOnOnes)
      .where(
        and(eq(oneOnOnes.personId, personId), eq(oneOnOnes.status, 'planned')),
      )
      .run();
    return tx
      .insert(oneOnOnes)
      .values({ personId, plannedAt, status: 'planned' })
      .returning()
      .get();
  });
}

export function deleteOneOnOne(id: number): void {
  db.delete(oneOnOnes).where(eq(oneOnOnes.id, id)).run();
}

/* --------------------------- обязательства --------------------------- */

export function createCommitment(input: {
  personId: number;
  direction: 'i_owe' | 'they_owe';
  title: string;
  details?: string | null;
  dueAt?: DayType | null;
}): CommitmentType {
  return db.insert(commitments).values(input).returning().get();
}

export function updateCommitment(
  id: number,
  input: Partial<{
    status: CommitmentType['status'];
    title: string;
    details: string | null;
    dueAt: DayType | null;
    snoozedUntil: DayType | null;
  }>,
): CommitmentType | null {
  const completedAt =
    input.status === 'done' ? today() : input.status ? null : undefined;

  return (
    db
      .update(commitments)
      .set({
        ...input,
        ...(completedAt === undefined ? {} : { completedAt }),
        updatedAt: nowTs(),
      })
      .where(eq(commitments.id, id))
      .returning()
      .get() ?? null
  );
}

export function deleteCommitment(id: number): void {
  db.delete(commitments).where(eq(commitments.id, id)).run();
}

export function commitmentsByPeople(
  personIds: readonly number[],
): CommitmentType[] {
  if (personIds.length === 0) return [];
  return db
    .select()
    .from(commitments)
    .where(inArray(commitments.personId, [...personIds]))
    .all();
}

/* ------------------------------- карма ------------------------------- */

export function createKarma(input: {
  personId: number;
  category: string;
  description: string;
  happenedAt?: DayType;
}): KarmaEntryType {
  return db
    .insert(karmaEntries)
    .values({ ...input, happenedAt: input.happenedAt ?? today() })
    .returning()
    .get();
}

export function deleteKarma(id: number): void {
  db.delete(karmaEntries).where(eq(karmaEntries.id, id)).run();
}
