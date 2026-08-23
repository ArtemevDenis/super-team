import { addDays, daysBetween, maxDay, minDay, type DayType } from './dates.js';

export type CalendarAbsenceType = {
  id: number;
  personId: number;
  fromDay: DayType;
  toDay: DayType;
  kind: string;
};

export type CalendarPersonType = {
  personId: number;
  fullName: string;
  photoPath: string | null;
  absences: CalendarAbsenceType[];
  /** Дней отсутствия внутри окна — по ним сортируются люди в группе. */
  daysAway: number;
};

/**
 * Отрезок, на котором группа реально просела. Границы — конкретные дни,
 * а не неделя: неделя как единица завышает, потому что двое, чьи отпуска
 * попали в один календарный отрезок, могли не пересечься ни одним днём.
 */
export type CoverageGapType = {
  fromDay: DayType;
  toDay: DayType;
  /** Максимум одновременно отсутствующих на этом отрезке. */
  awayCount: number;
  total: number;
};

export type CalendarGroupType = {
  /** «Мобильная разработка · iOS» — единица, которая друг друга подменяет. */
  label: string;
  specializationName: string | null;
  people: CalendarPersonType[];
  gaps: CoverageGapType[];
};

export type CalendarDepartmentType = {
  name: string;
  color: string;
  groups: CalendarGroupType[];
};

export type CalendarMonthType = {
  label: string;
  startDay: DayType;
  days: number;
};

export type AbsenceCalendarType = {
  from: DayType;
  to: DayType;
  totalDays: number;
  months: CalendarMonthType[];
  weekStarts: DayType[];
  departments: CalendarDepartmentType[];
};

const MONTHS_NOMINATIVE = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/**
 * Сколько человек должно отсутствовать одновременно, чтобы это считалось
 * провалом. Один отсутствующий — это просто отпуск; проблема начинается,
 * когда некому подменить.
 */
const MIN_SIMULTANEOUS = 2;

/** Понедельник недели, в которую попадает день. */
export function weekStart(day: DayType): DayType {
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  // getUTCDay: 0 — воскресенье, поэтому сдвигаем к понедельнику.
  const shift = (utc.getUTCDay() + 6) % 7;
  return addDays(day, -shift);
}

function covers(
  absence: { fromDay: DayType; toDay: DayType },
  day: DayType,
): boolean {
  return absence.fromDay <= day && absence.toDay >= day;
}

function overlaps(
  absence: { fromDay: DayType; toDay: DayType },
  from: DayType,
  to: DayType,
): boolean {
  return absence.fromDay <= to && absence.toDay >= from;
}

function overlapDays(
  absence: { fromDay: DayType; toDay: DayType },
  from: DayType,
  to: DayType,
): number {
  if (!overlaps(absence, from, to)) return 0;
  return daysBetween(maxDay(absence.fromDay, from), minDay(absence.toDay, to)) + 1;
}

/**
 * Отрезки, на которых группа теряет половину состава и при этом
 * отсутствует не меньше двух человек одновременно.
 *
 * Считается по дням, а не по неделям. Неделя как единица отвечает на вопрос
 * «отсутствовал ли кто-нибудь на этой неделе», а нужен ответ на «сколько
 * человек нет в один и тот же день» — это разные числа, и первое всегда
 * больше.
 */
export function findCoverageGaps(
  people: readonly CalendarPersonType[],
  from: DayType,
  to: DayType,
): CoverageGapType[] {
  const total = people.length;
  if (total === 0) return [];

  const gaps: CoverageGapType[] = [];
  let runStart: DayType | null = null;
  let runPeak = 0;

  for (let day = from; day <= to; day = addDays(day, 1)) {
    const awayCount = people.filter((person) =>
      person.absences.some((absence) => covers(absence, day)),
    ).length;

    const isThin = awayCount >= MIN_SIMULTANEOUS && awayCount * 2 >= total;

    if (isThin) {
      if (runStart === null) {
        runStart = day;
        runPeak = awayCount;
      } else {
        runPeak = Math.max(runPeak, awayCount);
      }
    } else if (runStart !== null) {
      gaps.push({
        fromDay: runStart,
        toDay: addDays(day, -1),
        awayCount: runPeak,
        total,
      });
      runStart = null;
      runPeak = 0;
    }
  }

  if (runStart !== null) {
    gaps.push({ fromDay: runStart, toDay: to, awayCount: runPeak, total });
  }

  return gaps;
}

function buildMonths(from: DayType, to: DayType): CalendarMonthType[] {
  const months: CalendarMonthType[] = [];
  let cursor = from;

  while (cursor <= to) {
    const [year, month] = cursor.split('-').map(Number);
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(
      Date.UTC(year ?? 1970, month ?? 1, 0),
    ).getUTCDate()}`;
    const segmentEnd = minDay(monthEnd, to);

    months.push({
      label: MONTHS_NOMINATIVE[(month ?? 1) - 1] ?? '',
      startDay: cursor,
      days: daysBetween(cursor, segmentEnd) + 1,
    });

    cursor = addDays(segmentEnd, 1);
  }

  return months;
}

export type CalendarInputPersonType = {
  personId: number;
  fullName: string;
  photoPath: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  specializationName: string | null;
};

/**
 * Календарь отсутствий на окно вперёд.
 *
 * Смысл не в списке отпусков, а в пересечениях: список можно и в чате
 * прочитать, а вот «с 14 по 16 сентября из трёх iOS-разработчиков остаётся
 * один» видно только на общей шкале.
 *
 * Группировка идёт по специализации внутри отдела, а не по отделу целиком:
 * подменяют друг друга те, кто делает одну и ту же работу, и андроидчик
 * не закроет iOS, сколько бы людей ни было в отделе.
 */
export function buildAbsenceCalendar(
  people: readonly CalendarInputPersonType[],
  absences: readonly CalendarAbsenceType[],
  today: DayType,
  windowDays = 90,
): AbsenceCalendarType {
  const from = today;
  const to = addDays(today, windowDays);

  // Берутся все отсутствия, пересекающие окно, а не только начинающиеся
  // в нём: отпуск, который начался вчера и кончится через неделю, — это
  // ровно то, что нужно видеть сегодня.
  const inWindow = absences.filter((absence) => overlaps(absence, from, to));
  const byPerson = new Map<number, CalendarAbsenceType[]>();
  for (const absence of inWindow) {
    byPerson.set(absence.personId, [
      ...(byPerson.get(absence.personId) ?? []),
      absence,
    ]);
  }

  const weekStarts: DayType[] = [];
  for (let cursor = weekStart(from); cursor <= to; cursor = addDays(cursor, 7)) {
    weekStarts.push(cursor);
  }

  const toCalendarPerson = (person: CalendarInputPersonType): CalendarPersonType => {
    const personAbsences = (byPerson.get(person.personId) ?? []).sort((a, b) =>
      a.fromDay < b.fromDay ? -1 : 1,
    );
    return {
      personId: person.personId,
      fullName: person.fullName,
      photoPath: person.photoPath,
      absences: personAbsences,
      daysAway: personAbsences.reduce(
        (sum, absence) => sum + overlapDays(absence, from, to),
        0,
      ),
    };
  };

  const byDepartment = new Map<string, CalendarInputPersonType[]>();
  for (const person of people) {
    const key = person.departmentName ?? 'Без отдела';
    byDepartment.set(key, [...(byDepartment.get(key) ?? []), person]);
  }

  const departments: CalendarDepartmentType[] = [...byDepartment.entries()].map(
    ([name, members]) => {
      const bySpecialization = new Map<string, CalendarInputPersonType[]>();
      for (const person of members) {
        const key = person.specializationName ?? 'Без специализации';
        bySpecialization.set(key, [...(bySpecialization.get(key) ?? []), person]);
      }

      const groups: CalendarGroupType[] = [...bySpecialization.entries()].map(
        ([specialization, groupMembers]) => {
          const calendarPeople = groupMembers
            .map(toCalendarPerson)
            .sort(
              (a, b) =>
                b.daysAway - a.daysAway || a.fullName.localeCompare(b.fullName),
            );

          return {
            label: `${name} · ${specialization}`,
            specializationName: specialization,
            people: calendarPeople,
            gaps: findCoverageGaps(calendarPeople, from, to),
          };
        },
      );

      return {
        name,
        color: members[0]?.departmentColor ?? '#64748b',
        groups: groups.sort((a, b) => a.label.localeCompare(b.label)),
      };
    },
  );

  return {
    from,
    to,
    totalDays: daysBetween(from, to) + 1,
    months: buildMonths(from, to),
    weekStarts,
    departments,
  };
}
