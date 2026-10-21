import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  absences,
  departments,
  grades,
  people,
  personEvents,
  specializations,
} from '../db/schema.js';

import { nowTs, today, type DayType } from '../domain/dates.js';
import { currentTeamId, teamPersonIds } from './teams.js';

export type PersonType = typeof people.$inferSelect;
export type PersonEventType = typeof personEvents.$inferSelect;
export type AbsenceType = typeof absences.$inferSelect;

export type PersonWithRefsType = PersonType & {
  specializationName: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  departmentId: number | null;
  gradeName: string | null;
  gradeLevel: number | null;
};

function selectPeopleBase() {
  return db
    .select({
      id: people.id,
      fullName: people.fullName,
      kind: people.kind,
      externalRole: people.externalRole,
      specializationId: people.specializationId,
      gradeId: people.gradeId,
      photoPath: people.photoPath,
      hiredAt: people.hiredAt,
      probationEndsAt: people.probationEndsAt,
      birthday: people.birthday,
      cadenceDays: people.cadenceDays,
      status: people.status,
      leftAt: people.leftAt,
      archivedAt: people.archivedAt,
      archiveReason: people.archiveReason,
      lastQuadrant: people.lastQuadrant,
      lastQuadrantAt: people.lastQuadrantAt,
      createdAt: people.createdAt,
      updatedAt: people.updatedAt,
      specializationName: specializations.name,
      departmentId: departments.id,
      departmentName: departments.name,
      departmentColor: departments.color,
      gradeName: grades.name,
      gradeLevel: grades.level,
    })
    .from(people)
    .leftJoin(specializations, eq(people.specializationId, specializations.id))
    .leftJoin(departments, eq(specializations.departmentId, departments.id))
    .leftJoin(grades, eq(people.gradeId, grades.id));
}

export function listPeople(
  includeArchived = false,
  kind?: 'member' | 'peer',
): PersonWithRefsType[] {
  const rows = selectPeopleBase()
    .where(eq(people.teamId, currentTeamId()))
    .all() as PersonWithRefsType[];
  return rows
    .filter((person) => includeArchived || person.status === 'active')
    .filter((person) => !kind || person.kind === kind);
}

/**
 * Человек только из текущей команды.
 *
 * Идентификатор сквозной, поэтому /person/5 из закладки открыл бы человека
 * чужой команды — с грейдами и атрибутами, которых в этой команде нет.
 * Честнее ответить «не найден».
 */
export function getPerson(id: number): PersonWithRefsType | null {
  const row = selectPeopleBase()
    .where(and(eq(people.id, id), eq(people.teamId, currentTeamId())))
    .get();
  return (row as PersonWithRefsType | undefined) ?? null;
}

export type CreatePersonInputType = {
  fullName: string;
  kind?: 'member' | 'peer';
  externalRole?: string | null;
  specializationId?: number | null;
  gradeId?: number | null;
  hiredAt?: DayType | null;
  probationEndsAt?: DayType | null;
  birthday?: DayType | null;
  cadenceDays?: number;
};

export function createPerson(input: CreatePersonInputType): PersonType {
  const teamId = currentTeamId();
  return db.transaction((tx) => {
    const person = tx
      .insert(people)
      .values({ ...input, teamId })
      .returning()
      .get();

    if (person.hiredAt) {
      tx.insert(personEvents)
        .values({ personId: person.id, kind: 'hired', at: person.hiredAt })
        .run();
    }
    return person;
  });
}

export type UpdatePersonInputType = Partial<CreatePersonInputType>;

/**
 * Единственное место, где меняются grade_id и specialization_id — журнал
 * событий пишется здесь же. Разнеси эти два действия по разным вызовам, и
 * однажды повышение пройдёт мимо истории, а восстановить его будет неоткуда.
 */
export function updatePerson(
  id: number,
  input: UpdatePersonInputType & { note?: string | null },
): PersonType | null {
  return db.transaction((tx) => {
    const before = tx.select().from(people).where(eq(people.id, id)).get();
    if (!before) return null;

    const { note, ...fields } = input;
    const after = tx
      .update(people)
      .set({ ...fields, updatedAt: nowTs() })
      .where(eq(people.id, id))
      .returning()
      .get();

    /**
     * В журнал пишутся названия, а не идентификаторы. Запись «грейд 2 → 3»
     * через год не читается вовсе, а если грейд переименуют или удалят, id
     * не разрешится ни во что. История должна хранить то, что было верно
     * на тот момент.
     */
    const gradeName = (gradeId: number | null) =>
      gradeId === null
        ? null
        : (tx.select().from(grades).where(eq(grades.id, gradeId)).get()?.name ?? null);

    const specializationName = (specializationId: number | null) =>
      specializationId === null
        ? null
        : (tx
            .select()
            .from(specializations)
            .where(eq(specializations.id, specializationId))
            .get()?.name ?? null);

    const at = today();
    if (fields.gradeId !== undefined && fields.gradeId !== before.gradeId) {
      tx.insert(personEvents)
        .values({
          personId: id,
          kind: 'grade_change',
          at,
          fromValue: gradeName(before.gradeId),
          toValue: gradeName(fields.gradeId ?? null),
          note: note ?? null,
        })
        .run();
    }
    if (
      fields.specializationId !== undefined &&
      fields.specializationId !== before.specializationId
    ) {
      tx.insert(personEvents)
        .values({
          personId: id,
          kind: 'specialization_change',
          at,
          fromValue: specializationName(before.specializationId),
          toValue: specializationName(fields.specializationId ?? null),
          note: note ?? null,
        })
        .run();
    }

    return after;
  });
}

export function archivePerson(
  id: number,
  input: { leftAt?: DayType | null; reason?: string | null },
): PersonType | null {
  return db.transaction((tx) => {
    const after = tx
      .update(people)
      .set({
        status: 'archived',
        archivedAt: nowTs(),
        leftAt: input.leftAt ?? today(),
        archiveReason: input.reason ?? null,
        updatedAt: nowTs(),
      })
      .where(eq(people.id, id))
      .returning()
      .get();
    if (!after) return null;

    tx.insert(personEvents)
      .values({
        personId: id,
        kind: 'left',
        at: after.leftAt ?? today(),
        note: input.reason ?? null,
      })
      .run();
    return after;
  });
}

export function restorePerson(id: number): PersonType | null {
  return db.transaction((tx) => {
    const after = tx
      .update(people)
      .set({
        status: 'active',
        archivedAt: null,
        leftAt: null,
        archiveReason: null,
        updatedAt: nowTs(),
      })
      .where(eq(people.id, id))
      .returning()
      .get();
    if (!after) return null;

    tx.insert(personEvents)
      .values({ personId: id, kind: 'returned', at: today() })
      .run();
    return after;
  });
}

export function listPersonEvents(personId: number): PersonEventType[] {
  return db
    .select()
    .from(personEvents)
    .where(eq(personEvents.personId, personId))
    .orderBy(desc(personEvents.at))
    .all();
}

/* ---------------------------- отсутствия ---------------------------- */

export function listAbsences(personId?: number): AbsenceType[] {
  const query = db.select().from(absences);
  const rows = personId
    ? query.where(eq(absences.personId, personId)).all()
    : query.where(inArray(absences.personId, teamPersonIds())).all();
  return rows.sort((a, b) => (a.fromDay < b.fromDay ? 1 : -1));
}


export function createAbsence(input: {
  personId: number;
  fromDay: DayType;
  toDay: DayType;
  kind?: (typeof absences.$inferInsert)['kind'];
  note?: string | null;
}): AbsenceType {
  return db.insert(absences).values(input).returning().get();
}

export function updateAbsence(
  id: number,
  input: {
    fromDay?: DayType;
    toDay?: DayType;
    kind?: (typeof absences.$inferInsert)['kind'];
    note?: string | null;
  },
): AbsenceType | null {
  return (
    db
      .update(absences)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(absences.id, id))
      .returning()
      .get() ?? null
  );
}

export function getAbsence(id: number): AbsenceType | null {
  return db.select().from(absences).where(eq(absences.id, id)).get() ?? null;
}

/**
 * Удаление задним числом меняет прошлое: отпуск, который на самом деле не
 * состоялся, переставал останавливать часы каденции — и просрочки тех
 * недель пересчитываются. Это и есть правильное поведение, поэтому никакой
 * «мягкой» пометки здесь нет.
 */
export function deleteAbsence(id: number): void {
  db.delete(absences).where(eq(absences.id, id)).run();
}

export function isAbsentToday(personId: number): boolean {
  const day = today();
  return (
    db
      .select({ id: absences.id })
      .from(absences)
      .where(
        and(
          eq(absences.personId, personId),
          lte(absences.fromDay, day),
          gte(absences.toDay, day),
        ),
      )
      .get() !== undefined
  );
}
