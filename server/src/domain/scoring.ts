import { SCALE_MAX } from '../db/schema.js';
import { daysBetween, type DayType } from './dates.js';

export type ConfidenceType = 'sure' | 'assuming';

export type AssessedAttributeType = {
  attributeId: number;
  key: string;
  name: string;
  shortCode: string;
  kind: 'core' | 'skill';
  axis: 'skill' | 'will' | 'neutral';
  /** null — атрибут применим к человеку, но ни разу не оценён. */
  value: number | null;
  confidence: ConfidenceType | null;
  assessedAt: DayType | null;
};

/* ------------------------------ отображение ----------------------------- */

const DISPLAY_MIN = 39;
const DISPLAY_MAX = 99;

/** Шкала 1..5 → 39..99, как на футбольной карточке: 1→39, 3→69, 5→99. */
export function displayValue(value: number): number {
  const normalized = (value - 1) / (SCALE_MAX - 1);
  return Math.round(DISPLAY_MIN + normalized * (DISPLAY_MAX - DISPLAY_MIN));
}

/* ------------------------------- надёжность ----------------------------- */

export type ReliabilityType = {
  /** 0..1 — насколько можно верить текущему значению. */
  score: number;
  ageDays: number | null;
  isStale: boolean;
};

const STALE_AFTER_DAYS = 180;
const ASSUMING_FACTOR = 0.6;

/**
 * Надёжность — только сигнал, никогда не математика.
 *
 * Она не входит в OVR намеренно. Если число падает само, без единого твоего
 * действия, лид перестаёт доверять всем числам приложения — и уже навсегда.
 * Устаревшая оценка должна поднимать флаг «пора переоценить», а не тихо
 * занижать результат.
 */
export function reliability(
  assessedAt: DayType | null,
  confidence: ConfidenceType | null,
  today: DayType,
): ReliabilityType {
  if (!assessedAt) return { score: 0, ageDays: null, isStale: false };

  const ageDays = daysBetween(assessedAt, today);
  const freshness = Math.max(0, Math.min(1, 1 - ageDays / 365));
  const factor = confidence === 'assuming' ? ASSUMING_FACTOR : 1;

  return {
    score: freshness * factor,
    ageDays,
    isStale: ageDays > STALE_AFTER_DAYS,
  };
}

/* ---------------------------------- OVR --------------------------------- */

export type OvrType = {
  /** null — оценён не весь набор core-атрибутов. */
  value: number | null;
  assessed: number;
  total: number;
};

/**
 * OVR считается только по core-атрибутам: узкие скиллы — это подстаты
 * позиции, а не общий уровень, и человек с двенадцатью оценёнными скиллами
 * не должен обгонять того, у кого их четыре.
 *
 * Холодный старт: если хоть один core-атрибут не оценён — null, и карточка
 * показывает `??`. Частичный OVR уверенно врёт, и по нему это не видно.
 */
export function computeOvr(core: readonly AssessedAttributeType[]): OvrType {
  const assessed = core.filter((attribute) => attribute.value !== null);

  if (core.length === 0 || assessed.length < core.length) {
    return { value: null, assessed: assessed.length, total: core.length };
  }

  const sum = assessed.reduce(
    (total, attribute) => total + displayValue(attribute.value!),
    0,
  );

  return {
    value: Math.round(sum / assessed.length),
    assessed: assessed.length,
    total: core.length,
  };
}

/* ---------------------------- дельта от грейда --------------------------- */

export type ExpectationType = {
  attributeId: number;
  expectedValue: number;
};

export type GradeGapType = {
  attributeId: number;
  name: string;
  shortCode: string;
  expected: number;
  actual: number | null;
  gap: number;
};

export type GradeDeltaType = {
  /** 0..1 — насколько человек дотягивает; null, если оценено не всё. */
  match: number | null;
  gaps: GradeGapType[];
  unassessed: number;
};

/**
 * Превышение ожидания не является разрывом.
 *
 * Иначе сильный в одном и слабый в другом выглядел бы ровно как средний
 * по обоим, и дельта перестала бы отвечать на свой единственный вопрос —
 * «чего конкретно не хватает».
 */
export function gradeDelta(
  attributes: readonly AssessedAttributeType[],
  expectations: readonly ExpectationType[],
): GradeDeltaType {
  const byId = new Map(attributes.map((attribute) => [attribute.attributeId, attribute]));

  // Учитываются только применимые к человеку атрибуты: ожидание по скиллу
  // чужой специализации к нему отношения не имеет.
  const applicable = expectations.filter((e) => byId.has(e.attributeId));

  const gaps: GradeGapType[] = applicable.map((expectation) => {
    const attribute = byId.get(expectation.attributeId)!;
    return {
      attributeId: expectation.attributeId,
      name: attribute.name,
      shortCode: attribute.shortCode,
      expected: expectation.expectedValue,
      actual: attribute.value,
      gap:
        attribute.value === null
          ? expectation.expectedValue
          : Math.max(0, expectation.expectedValue - attribute.value),
    };
  });

  const unassessed = gaps.filter((gap) => gap.actual === null).length;
  const totalExpected = gaps.reduce((sum, gap) => sum + gap.expected, 0);

  // Та же логика, что у OVR: неполные данные дают «не знаю», а не заниженное
  // число, которое выглядит как факт.
  const match =
    unassessed > 0 || totalExpected === 0
      ? null
      : 1 - gaps.reduce((sum, gap) => sum + gap.gap, 0) / totalExpected;

  return {
    match,
    gaps: gaps.filter((gap) => gap.gap > 0).sort((a, b) => b.gap - a.gap),
    unassessed,
  };
}

/** Что именно нужно подтянуть до следующего грейда — не больше трёх пунктов. */
export function topGaps(delta: GradeDeltaType, limit = 3): GradeGapType[] {
  return delta.gaps.slice(0, limit);
}

/* ---------------------------------- тир --------------------------------- */

export type CardTierType = 'bronze' | 'silver' | 'gold' | 'special';

/**
 * Тир карточки — от грейда, а не от OVR. Senior с 70 и Junior с 70 — разные
 * вещи, и цвет карточки должен говорить об уровне позиции, а не о среднем.
 */
export function cardTier(gradeLevel: number | null): CardTierType {
  if (gradeLevel === null) return 'bronze';
  if (gradeLevel >= 4) return 'special';
  if (gradeLevel === 3) return 'gold';
  if (gradeLevel === 2) return 'silver';
  return 'bronze';
}
