import { asc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  attributes,
  assessments,
  departments,
  grades,
  people,
  specializations,
} from '../db/schema.js';
import { nowTs } from '../domain/dates.js';
import { currentTeamId } from './teams.js';

export type DepartmentType = typeof departments.$inferSelect;
export type SpecializationType = typeof specializations.$inferSelect;
export type GradeType = typeof grades.$inferSelect;

export type UsageType = {
  people: number;
  /** Только для специализаций: компетенции и снимки оценок за ними. */
  attributes: number;
  assessments: number;
  /** Только для отделов. */
  specializations: number;
};

export function listDepartments(includeHidden = false): DepartmentType[] {
  const rows = db
    .select()
    .from(departments)
    .where(eq(departments.teamId, currentTeamId()))
    .orderBy(asc(departments.sortOrder), asc(departments.name))
    .all();
  return includeHidden ? rows : rows.filter((row) => row.isActive);
}

export function listSpecializations(includeHidden = false): SpecializationType[] {
  // Специализация принадлежит команде через отдел — отдельной колонки нет
  // намеренно, иначе появилась бы возможность рассинхронизации.
  const ownDepartments = new Set(listDepartments(true).map((d) => d.id));
  const rows = db
    .select()
    .from(specializations)
    .orderBy(asc(specializations.sortOrder), asc(specializations.name))
    .all()
    .filter((row) => ownDepartments.has(row.departmentId));
  return includeHidden ? rows : rows.filter((row) => row.isActive);
}

export function listGrades(): GradeType[] {
  return db
    .select()
    .from(grades)
    .where(eq(grades.teamId, currentTeamId()))
    .orderBy(asc(grades.level))
    .all();
}

/* ------------------------------- отделы ------------------------------- */

export function departmentUsage(id: number): UsageType {
  const specs = db
    .select({ id: specializations.id })
    .from(specializations)
    .where(eq(specializations.departmentId, id))
    .all();

  const peopleCount = specs.reduce(
    (sum, spec) =>
      sum +
      db
        .select({ id: people.id })
        .from(people)
        .where(eq(people.specializationId, spec.id))
        .all().length,
    0,
  );

  return {
    people: peopleCount,
    attributes: 0,
    assessments: 0,
    specializations: specs.length,
  };
}

export function createDepartment(input: {
  name: string;
  color?: string;
}): DepartmentType {
  const maxOrder = listDepartments(true).reduce(
    (max, row) => Math.max(max, row.sortOrder),
    -1,
  );
  return db
    .insert(departments)
    .values({
      teamId: currentTeamId(),
      name: input.name,
      color: input.color ?? '#64748b',
      sortOrder: maxOrder + 1,
    })
    .returning()
    .get();
}

export function updateDepartment(
  id: number,
  input: { name?: string; color?: string; isActive?: boolean },
): DepartmentType | null {
  return (
    db
      .update(departments)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(departments.id, id))
      .returning()
      .get() ?? null
  );
}

export type RemovalResultType =
  | { deleted: true }
  | { deleted: false; hidden: true; usage: UsageType };

/** Отдел с направлениями внутри не удаляется — иначе упадёт внешний ключ. */
export function removeDepartment(id: number): RemovalResultType | null {
  const department = db
    .select()
    .from(departments)
    .where(eq(departments.id, id))
    .get();
  if (!department) return null;

  const usage = departmentUsage(id);
  if (usage.specializations > 0) {
    db.update(departments)
      .set({ isActive: false, updatedAt: nowTs() })
      .where(eq(departments.id, id))
      .run();
    return { deleted: false, hidden: true, usage };
  }

  db.delete(departments).where(eq(departments.id, id)).run();
  return { deleted: true };
}

/* ---------------------------- специализации --------------------------- */

export function specializationUsage(id: number): UsageType {
  const attributeIds = db
    .select({ id: attributes.id })
    .from(attributes)
    .where(eq(attributes.specializationId, id))
    .all()
    .map((row) => row.id);

  const assessmentCount = attributeIds.reduce(
    (sum, attributeId) =>
      sum +
      db
        .select({ id: assessments.id })
        .from(assessments)
        .where(eq(assessments.attributeId, attributeId))
        .all().length,
    0,
  );

  return {
    people: db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.specializationId, id))
      .all().length,
    attributes: attributeIds.length,
    assessments: assessmentCount,
    specializations: 0,
  };
}

export function createSpecialization(input: {
  name: string;
  departmentId: number;
}): SpecializationType {
  const maxOrder = listSpecializations(true).reduce(
    (max, row) => Math.max(max, row.sortOrder),
    -1,
  );
  return db
    .insert(specializations)
    .values({ ...input, sortOrder: maxOrder + 1 })
    .returning()
    .get();
}

export function updateSpecialization(
  id: number,
  input: { name?: string; departmentId?: number; isActive?: boolean },
): SpecializationType | null {
  return (
    db
      .update(specializations)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(specializations.id, id))
      .returning()
      .get() ?? null
  );
}

/**
 * Специализация с людьми, компетенциями или оценками скрывается, а не
 * удаляется.
 *
 * Внешние ключи устроены каскадом: специализация → её компетенции →
 * снимки оценок по ним. Одно удаление молча уничтожает всю историю оценок
 * по этому направлению, и восстановить её неоткуда. Скрытая специализация
 * просто исчезает из выбора.
 */
export function removeSpecialization(id: number): RemovalResultType | null {
  const specialization = db
    .select()
    .from(specializations)
    .where(eq(specializations.id, id))
    .get();
  if (!specialization) return null;

  const usage = specializationUsage(id);
  if (usage.people > 0 || usage.assessments > 0 || usage.attributes > 0) {
    db.update(specializations)
      .set({ isActive: false, updatedAt: nowTs() })
      .where(eq(specializations.id, id))
      .run();
    return { deleted: false, hidden: true, usage };
  }

  db.delete(specializations).where(eq(specializations.id, id)).run();
  return { deleted: true };
}

/* ------------------------------- грейды ------------------------------- */

export function createGrade(input: { name: string; level: number }): GradeType {
  return db
    .insert(grades)
    .values({ ...input, teamId: currentTeamId() })
    .returning()
    .get();
}

export function updateGrade(
  id: number,
  input: { name?: string; level?: number },
): GradeType | null {
  return (
    db
      .update(grades)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(grades.id, id))
      .returning()
      .get() ?? null
  );
}
