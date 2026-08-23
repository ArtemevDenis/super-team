import { addDays, daysBetween, isWithin, maxDay, minDay, type DayType } from './dates.js';

export type AbsenceIntervalType = {
  fromDay: DayType;
  toDay: DayType;
};

export type CadenceInputType = {
  today: DayType;
  cadenceDays: number;
  /** День последнего состоявшегося 1-1; null — не было ни одного. */
  lastDoneAt: DayType | null;
  hiredAt: DayType | null;
  absences: readonly AbsenceIntervalType[];
};

export type CadenceStateType = {
  lastDoneAt: DayType | null;
  /** Календарных дней с последнего 1-1 — то, что показываем человеку. */
  daysSinceLast: number | null;
  /** То же за вычетом отсутствий — то, по чему решается «просрочено». */
  effectiveDaysSinceLast: number | null;
  dueAt: DayType | null;
  overdueDays: number;
  isOverdue: boolean;
  isAbsentToday: boolean;
  /** Ни одного 1-1 никогда не было. */
  neverMet: boolean;
  /** Дней в команде; null, если дата найма не указана. */
  tenureDays: number | null;
};

/** Склеивает пересекающиеся и смежные интервалы, чтобы не считать дни дважды. */
function mergeIntervals(
  intervals: readonly AbsenceIntervalType[],
): AbsenceIntervalType[] {
  const sorted = [...intervals]
    .filter((i) => i.fromDay <= i.toDay)
    .sort((a, b) => (a.fromDay < b.fromDay ? -1 : a.fromDay > b.fromDay ? 1 : 0));

  const merged: AbsenceIntervalType[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.fromDay <= addDays(last.toDay, 1)) {
      last.toDay = maxDay(last.toDay, interval.toDay);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Число дней отсутствия внутри окна [from, to], включительно с обеих сторон. */
export function absentDaysInWindow(
  absences: readonly AbsenceIntervalType[],
  from: DayType,
  to: DayType,
): number {
  if (from > to) return 0;

  return mergeIntervals(absences).reduce((total, interval) => {
    const start = maxDay(interval.fromDay, from);
    const end = minDay(interval.toDay, to);
    return start > end ? total : total + daysBetween(start, end) + 1;
  }, 0);
}

export function isAbsentOn(
  absences: readonly AbsenceIntervalType[],
  dayValue: DayType,
): boolean {
  return absences.some((interval) =>
    isWithin(dayValue, interval.fromDay, interval.toDay),
  );
}

/**
 * Просрочка 1-1 по личной каденции, с паузой на отпуска и больничные.
 *
 * Пауза здесь не украшение: один алерт про человека, который три недели
 * в отпуске, учит закрывать ленту не читая — и дальше пропускаются уже
 * настоящие сигналы.
 */
export function computeCadence(input: CadenceInputType): CadenceStateType {
  const { today, cadenceDays, lastDoneAt, hiredAt, absences } = input;

  const isAbsentToday = isAbsentOn(absences, today);
  const tenureDays = hiredAt ? daysBetween(hiredAt, today) : null;

  // Точка отсчёта: последний 1-1, а для новичка — дата найма.
  const anchor = lastDoneAt ?? hiredAt;
  if (!anchor) {
    return {
      lastDoneAt,
      daysSinceLast: null,
      effectiveDaysSinceLast: null,
      dueAt: null,
      overdueDays: 0,
      isOverdue: false,
      isAbsentToday,
      neverMet: lastDoneAt === null,
      tenureDays,
    };
  }

  const calendarDays = daysBetween(anchor, today);
  const absentDays = absentDaysInWindow(absences, anchor, today);
  const effectiveDays = Math.max(0, calendarDays - absentDays);

  // Срок сдвигается вперёд ровно на число пропущенных из-за отсутствия дней.
  const dueAt = addDays(anchor, cadenceDays + absentDays);
  const overdueDays = Math.max(0, effectiveDays - cadenceDays);

  return {
    lastDoneAt,
    daysSinceLast: lastDoneAt ? calendarDays : null,
    effectiveDaysSinceLast: lastDoneAt ? effectiveDays : null,
    dueAt,
    overdueDays,
    isOverdue: overdueDays > 0 && !isAbsentToday,
    isAbsentToday,
    neverMet: lastDoneAt === null,
    tenureDays,
  };
}
