import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  assessments,
  attributes,
  gradeExpectations,
  grades,
  specializations,
} from '../db/schema.js';
import {
  CORE_ATTRIBUTES,
  GRADE_EXPECTATIONS,
  SPECIALIZATION_SKILLS,
} from '../domain/attribute-defaults.js';
import { nowTs, today, type DayType } from '../domain/dates.js';
import {
  cardTier,
  computeOvr,
  gradeDelta,
  reliability,
  topGaps,
  type AssessedAttributeType,
  type CardTierType,
  type GradeGapType,
  type OvrType,
  type ReliabilityType,
} from '../domain/scoring.js';
import { getPerson } from './people.js';
import { currentTeamId } from './teams.js';

export type AttributeRowType = typeof attributes.$inferSelect;
export type AssessmentRowType = typeof assessments.$inferSelect;

/** Идемпотентно: на пустой базе заводит core-атрибуты, скиллы и ожидания. */
export function ensureDefaultAttributes(): void {
  const teamId = currentTeamId();
  const existing = db
    .select({ id: attributes.id })
    .from(attributes)
    .where(eq(attributes.teamId, teamId))
    .get();
  if (existing) return;

  db.insert(attributes)
    .values(
      CORE_ATTRIBUTES.map((attribute, index) => ({
        teamId,
        key: attribute.key,
        name: attribute.name,
        shortCode: attribute.shortCode,
        kind: 'core' as const,
        specializationId: null,
        axis: attribute.axis,
        description: attribute.description,
        sortOrder: index,
      })),
    )
    .run();

  for (const specialization of db.select().from(specializations).all()) {
    const skills = SPECIALIZATION_SKILLS[specialization.name];
    if (!skills) continue;

    db.insert(attributes)
      .values(
        skills.map((name, index) => ({
          teamId,
          key: `${specialization.name.toLowerCase()}_${index}`,
          name,
          shortCode: name.slice(0, 3).toUpperCase(),
          kind: 'skill' as const,
          specializationId: specialization.id,
          axis: 'skill' as const,
          sortOrder: index,
        })),
      )
      .run();
  }

  const coreByKey = new Map(
    db
      .select()
      .from(attributes)
      .where(eq(attributes.kind, 'core'))
      .all()
      .map((attribute) => [attribute.key, attribute.id]),
  );

  for (const grade of db.select().from(grades).all()) {
    const profile = GRADE_EXPECTATIONS[grade.name];
    if (!profile) continue;

    db.insert(gradeExpectations)
      .values(
        Object.entries(profile)
          .filter(([key]) => coreByKey.has(key))
          .map(([key, expectedValue]) => ({
            gradeId: grade.id,
            attributeId: coreByKey.get(key)!,
            expectedValue,
          })),
      )
      .run();
  }
}

/* --------------------------- атрибуты: правка -------------------------- */

export type AttributeUsageType = {
  attributeId: number;
  assessments: number;
  people: number;
};

/** Сколько снимков и людей стоит за атрибутом — от этого зависит, можно ли его удалить. */
export function attributeUsage(attributeId: number): AttributeUsageType {
  const rows = db
    .select({ personId: assessments.personId })
    .from(assessments)
    .where(eq(assessments.attributeId, attributeId))
    .all();

  return {
    attributeId,
    assessments: rows.length,
    people: new Set(rows.map((row) => row.personId)).size,
  };
}

export function createAttribute(input: {
  name: string;
  shortCode: string;
  kind: 'core' | 'skill';
  specializationId?: number | null;
  axis?: 'skill' | 'will' | 'neutral';
  description?: string | null;
}): AttributeRowType {
  const siblings = db
    .select({ sortOrder: attributes.sortOrder })
    .from(attributes)
    .where(eq(attributes.kind, input.kind))
    .all();

  const maxOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1);

  // Ключ генерируется из времени, а не из имени: имя можно переименовать,
  // а ключ должен остаться прежним — по нему сходится всё остальное.
  return db
    .insert(attributes)
    .values({
      teamId: currentTeamId(),
      key: `attr_${Date.now()}_${maxOrder + 1}`,
      name: input.name,
      shortCode: input.shortCode.toUpperCase().slice(0, 4),
      kind: input.kind,
      specializationId: input.kind === 'skill' ? (input.specializationId ?? null) : null,
      axis: input.axis ?? (input.kind === 'skill' ? 'skill' : 'neutral'),
      description: input.description ?? null,
      sortOrder: maxOrder + 1,
    })
    .returning()
    .get();
}

export function updateAttribute(
  id: number,
  input: {
    name?: string;
    shortCode?: string;
    axis?: 'skill' | 'will' | 'neutral';
    description?: string | null;
    isActive?: boolean;
    sortOrder?: number;
  },
): AttributeRowType | null {
  return (
    db
      .update(attributes)
      .set({
        ...input,
        ...(input.shortCode
          ? { shortCode: input.shortCode.toUpperCase().slice(0, 4) }
          : {}),
        updatedAt: nowTs(),
      })
      .where(eq(attributes.id, id))
      .returning()
      .get() ?? null
  );
}

export type AttributeDeletionType =
  | { deleted: true }
  | { deleted: false; hidden: true; usage: AttributeUsageType };

/**
 * Атрибут с оценками не удаляется, а скрывается.
 *
 * Удаление уничтожило бы снимки — то есть историю роста, ради которой всё
 * и затевалось. Скрытый атрибут выпадает из OVR и из дельты по грейду, но
 * его прошлые оценки остаются видны в блоке «прошлый опыт».
 */
export function removeAttribute(id: number): AttributeDeletionType | null {
  const attribute = db.select().from(attributes).where(eq(attributes.id, id)).get();
  if (!attribute) return null;

  const usage = attributeUsage(id);
  if (usage.assessments > 0) {
    db.update(attributes)
      .set({ isActive: false, updatedAt: nowTs() })
      .where(eq(attributes.id, id))
      .run();
    return { deleted: false, hidden: true, usage };
  }

  db.delete(attributes).where(eq(attributes.id, id)).run();
  return { deleted: true };
}

export function reorderAttributes(ids: readonly number[]): void {
  db.transaction((tx) => {
    ids.forEach((id, index) => {
      tx.update(attributes)
        .set({ sortOrder: index, updatedAt: nowTs() })
        .where(eq(attributes.id, id))
        .run();
    });
  });
}

export function removeGradeExpectation(gradeId: number, attributeId: number): void {
  db.delete(gradeExpectations)
    .where(
      and(
        eq(gradeExpectations.gradeId, gradeId),
        eq(gradeExpectations.attributeId, attributeId),
      ),
    )
    .run();
}

export function listAttributes(includeInactive = false): AttributeRowType[] {
  const rows = db
    .select()
    .from(attributes)
    .where(eq(attributes.teamId, currentTeamId()))
    .orderBy(asc(attributes.kind), asc(attributes.sortOrder))
    .all();
  return includeInactive ? rows : rows.filter((attribute) => attribute.isActive);
}

/**
 * Текущее значение = последний снимок. Читается из вью, где тайбрейк идёт
 * по id: две оценки одной датой иначе возвращаются недетерминированно,
 * и OVR мерцает между перезагрузками страницы.
 */
function currentValues(personId: number): Map<number, {
  value: number;
  confidence: 'sure' | 'assuming';
  evidence: string | null;
  assessedAt: DayType;
}> {
  const rows = db.all<{
    attribute_id: number;
    value: number;
    confidence: 'sure' | 'assuming';
    evidence: string | null;
    assessed_at: string;
  }>(sql`
    SELECT attribute_id, value, confidence, evidence, assessed_at
    FROM current_attribute_values
    WHERE person_id = ${personId}
  `);

  return new Map(
    rows.map((row) => [
      row.attribute_id,
      {
        value: row.value,
        confidence: row.confidence,
        evidence: row.evidence,
        assessedAt: row.assessed_at,
      },
    ]),
  );
}

export type ScoredAttributeType = AssessedAttributeType & {
  description: string | null;
  evidence: string | null;
  reliability: ReliabilityType;
  expected: number | null;
};

export type PersonCardType = {
  personId: number;
  fullName: string;
  photoPath: string | null;
  gradeName: string | null;
  gradeLevel: number | null;
  specializationName: string | null;
  departmentName: string | null;
  tier: CardTierType;
  ovr: OvrType;
  core: ScoredAttributeType[];
  skills: ScoredAttributeType[];
  /** Атрибуты с оценками, но вне текущей специализации — «прошлый опыт». */
  pastExperience: ScoredAttributeType[];
  gradeMatch: number | null;
  nextGrade: { name: string; match: number | null; gaps: GradeGapType[] } | null;
  currentGaps: GradeGapType[];
};

function expectationsFor(gradeId: number | null) {
  if (gradeId === null) return [];
  return db
    .select()
    .from(gradeExpectations)
    .where(eq(gradeExpectations.gradeId, gradeId))
    .all();
}

export function buildPersonCard(personId: number): PersonCardType | null {
  const person = getPerson(personId);
  if (!person) return null;

  const day = today();
  const values = currentValues(personId);
  const all = listAttributes();

  const expectations = expectationsFor(person.gradeId);
  const expectedByAttribute = new Map(
    expectations.map((e) => [e.attributeId, e.expectedValue]),
  );

  const toScored = (attribute: AttributeRowType): ScoredAttributeType => {
    const current = values.get(attribute.id) ?? null;
    return {
      attributeId: attribute.id,
      key: attribute.key,
      name: attribute.name,
      shortCode: attribute.shortCode,
      kind: attribute.kind,
      axis: attribute.axis,
      description: attribute.description,
      value: current?.value ?? null,
      confidence: current?.confidence ?? null,
      assessedAt: current?.assessedAt ?? null,
      evidence: current?.evidence ?? null,
      reliability: reliability(
        current?.assessedAt ?? null,
        current?.confidence ?? null,
        day,
      ),
      expected: expectedByAttribute.get(attribute.id) ?? null,
    };
  };

  const core = all.filter((a) => a.kind === 'core').map(toScored);
  const skills = all
    .filter(
      (a) => a.kind === 'skill' && a.specializationId === person.specializationId,
    )
    .map(toScored);

  // Смена специализации ничего не удаляет: старые скиллы уходят в свёрнутый
  // блок и не участвуют ни в OVR, ни в дельте — но и не пропадают.
  //
  // Здесь берётся полный список, включая скрытые: атрибут, убранный из
  // настроек, выпадает из расчётов, но его прошлые оценки — это история
  // роста, и прятать её нельзя.
  const applicableIds = new Set([...core, ...skills].map((a) => a.attributeId));
  const pastExperience = listAttributes(true)
    .filter((a) => !applicableIds.has(a.id) && values.has(a.id))
    .map(toScored);

  const ovr = computeOvr(core);
  const applicable = [...core, ...skills];
  const currentDelta = gradeDelta(applicable, expectations);

  const nextGradeRow =
    person.gradeLevel === null
      ? null
      : db
          .select()
          .from(grades)
          .where(sql`${grades.level} > ${person.gradeLevel}`)
          .orderBy(asc(grades.level))
          .get();

  const nextDelta = nextGradeRow
    ? gradeDelta(applicable, expectationsFor(nextGradeRow.id))
    : null;

  return {
    personId,
    fullName: person.fullName,
    photoPath: person.photoPath,
    gradeName: person.gradeName,
    gradeLevel: person.gradeLevel,
    specializationName: person.specializationName,
    departmentName: person.departmentName,
    tier: cardTier(person.gradeLevel),
    ovr,
    core,
    skills,
    pastExperience,
    gradeMatch: currentDelta.match,
    nextGrade:
      nextGradeRow && nextDelta
        ? {
            name: nextGradeRow.name,
            match: nextDelta.match,
            gaps: topGaps(nextDelta),
          }
        : null,
    currentGaps: topGaps(currentDelta),
  };
}

/** Карточки только для членов команды: смежников не оценивают. */
export function listTeamCards(): PersonCardType[] {
  return db
    .select({ id: sql<number>`id` })
    .from(sql`active_people`)
    .where(sql`kind = 'member' AND team_id = ${currentTeamId()}`)
    .all()
    .map((row) => buildPersonCard(row.id))
    .filter((card): card is PersonCardType => card !== null);
}

/* ------------------------------ запись ------------------------------ */

export type SaveAssessmentInputType = {
  personId: number;
  attributeId: number;
  value: number;
  confidence?: 'sure' | 'assuming';
  evidence?: string | null;
  assessedAt?: DayType;
};

/** Снимок, а не правка: история — это и есть то, ради чего всё затевалось. */
export function saveAssessment(input: SaveAssessmentInputType): AssessmentRowType {
  return db
    .insert(assessments)
    .values({
      personId: input.personId,
      attributeId: input.attributeId,
      value: input.value,
      confidence: input.confidence ?? 'sure',
      evidence: input.evidence ?? null,
      assessedAt: input.assessedAt ?? today(),
    })
    .returning()
    .get();
}

/**
 * Массовая переоценка — одной транзакцией.
 *
 * Подтверждение без изменения тоже пишет снимок, с той же величиной и
 * свежей датой. Это не дубль: «я пересмотрел и подтверждаю четвёрку» —
 * такое же событие, как «поднял до пяти». Без него единственным способом
 * снять пометку об устаревании было бы соврать, поменяв цифру.
 */
export function saveAssessments(
  personId: number,
  items: readonly Omit<SaveAssessmentInputType, 'personId'>[],
): number {
  if (items.length === 0) return 0;

  return db.transaction((tx) => {
    const day = today();
    for (const item of items) {
      tx.insert(assessments)
        .values({
          personId,
          attributeId: item.attributeId,
          value: item.value,
          confidence: item.confidence ?? 'sure',
          evidence: item.evidence ?? null,
          assessedAt: item.assessedAt ?? day,
        })
        .run();
    }
    return items.length;
  });
}

export function listAssessmentHistory(
  personId: number,
  attributeId?: number,
): AssessmentRowType[] {
  const condition = attributeId
    ? and(eq(assessments.personId, personId), eq(assessments.attributeId, attributeId))
    : eq(assessments.personId, personId);

  return db
    .select()
    .from(assessments)
    .where(condition)
    .orderBy(desc(assessments.assessedAt), desc(assessments.id))
    .all();
}

export function deleteAssessment(id: number): void {
  db.delete(assessments).where(eq(assessments.id, id)).run();
}

export function listGradeExpectations() {
  return db.select().from(gradeExpectations).all();
}

export function setGradeExpectation(
  gradeId: number,
  attributeId: number,
  expectedValue: number,
): void {
  db.insert(gradeExpectations)
    .values({ gradeId, attributeId, expectedValue })
    .onConflictDoUpdate({
      target: [gradeExpectations.gradeId, gradeExpectations.attributeId],
      set: { expectedValue },
    })
    .run();
}
