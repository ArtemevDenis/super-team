import { SCALE_MAX } from '../db/schema.js';

export type ClimateCheckinType = {
  measuredAt: string;
  motivation: number;
  workloadPressure: number;
  satisfaction: number;
};

export type ClimateAxisType = 'motivation' | 'workloadPressure' | 'satisfaction';

export const CLIMATE_AXES: readonly ClimateAxisType[] = [
  'motivation',
  'workloadPressure',
  'satisfaction',
];

export const CLIMATE_AXIS_LABELS: Record<ClimateAxisType, string> = {
  motivation: 'Мотивация',
  workloadPressure: 'Нагрузка',
  satisfaction: 'Удовлетворённость',
};

/**
 * Подпись к крайним значениям — на форме 1-1 без неё непонятно, 5 это
 * хорошо или плохо.
 */
export const CLIMATE_AXIS_HINTS: Record<ClimateAxisType, [string, string]> = {
  motivation: ['выгорел', 'горит'],
  workloadPressure: ['простаивает', 'перегружен'],
  satisfaction: ['всё плохо', 'всё отлично'],
};

/** У нагрузки знак обратный: 5 = перегружен, то есть плохо. */
const IS_HIGHER_BETTER: Record<ClimateAxisType, boolean> = {
  motivation: true,
  workloadPressure: false,
  satisfaction: true,
};

/**
 * Единственная точка, где учитывается знак оси. Любая тепловая карта, любой
 * тренд и любое среднее обязаны идти через неё — иначе однажды появится
 * колонка с инвертированным цветом, и обнаружится это через полгода.
 */
export function toGoodness(axis: ClimateAxisType, rawValue: number): number {
  const normalized = (rawValue - 1) / (SCALE_MAX - 1);
  return IS_HIGHER_BETTER[axis] ? normalized : 1 - normalized;
}

export function checkinGoodness(checkin: ClimateCheckinType): number {
  return (
    (toGoodness('motivation', checkin.motivation) +
      toGoodness('workloadPressure', checkin.workloadPressure) +
      toGoodness('satisfaction', checkin.satisfaction)) /
    3
  );
}

/** Нужен, чтобы «упало на 2 пункта» считалось в исходных единицах шкалы. */
export function rawValue(
  checkin: ClimateCheckinType,
  axis: ClimateAxisType,
): number {
  return checkin[axis];
}

/* --------------------------- срез по команде --------------------------- */

export type PersonClimateType = {
  personId: number;
  /** Последний замер; null — человека ещё ни разу не замеряли. */
  latest: ClimateCheckinType | null;
  /** Предпоследний — по нему считается сдвиг среднего. */
  previous: ClimateCheckinType | null;
};

export type TeamAxisSummaryType = {
  key: ClimateAxisType;
  label: string;
  average: number | null;
  previousAverage: number | null;
  higherIsBetter: boolean;
  /** Сколько человек на каждом значении шкалы, от 1 до SCALE_MAX. */
  distribution: number[];
  /** Худшее значение и сколько человек на нём — среднее это скрывает. */
  worstValue: number | null;
  worstCount: number;
};

export type TeamClimateType = {
  measuredPeople: number;
  totalPeople: number;
  axes: TeamAxisSummaryType[];
};

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Срез климата по команде.
 *
 * Считается по последнему замеру каждого человека, а не по всем замерам
 * подряд: иначе тот, с кем встречаешься раз в неделю, влияет на среднее
 * втрое сильнее того, с кем раз в три недели, и «средняя мотивация команды»
 * начинает зависеть от твоего расписания, а не от команды.
 *
 * Рядом со средним обязательно идёт распределение: команда, где все на
 * тройке, и команда, где половина на пятёрке, а половина на единице, дают
 * одинаковое среднее — но вторая в кризисе.
 */
export function teamClimate(
  people: readonly PersonClimateType[],
): TeamClimateType {
  const measured = people.filter((person) => person.latest !== null);

  const axes = CLIMATE_AXES.map((axis): TeamAxisSummaryType => {
    const current = measured.map((person) => person.latest![axis]);
    const previous = people
      .filter((person) => person.previous !== null)
      .map((person) => person.previous![axis]);

    const distribution = Array.from({ length: SCALE_MAX }, (_, index) =>
      current.filter((value) => value === index + 1).length,
    );

    const higherIsBetter = IS_HIGHER_BETTER[axis];
    // «Худшее» зависит от знака оси: у нагрузки плохо наверху шкалы.
    const worstValue = current.length === 0
      ? null
      : higherIsBetter
        ? Math.min(...current)
        : Math.max(...current);

    return {
      key: axis,
      label: CLIMATE_AXIS_LABELS[axis],
      average: mean(current),
      previousAverage: mean(previous),
      higherIsBetter,
      distribution,
      worstValue,
      worstCount:
        worstValue === null
          ? 0
          : current.filter((value) => value === worstValue).length,
    };
  });

  return {
    measuredPeople: measured.length,
    totalPeople: people.length,
    axes,
  };
}
