import { describe, expect, it } from 'vitest';

import {
  buildAbsenceCalendar,
  weekStart,
  type CalendarAbsenceType,
  type CalendarInputPersonType,
} from './absence-calendar.js';

const TODAY = '2025-06-30'; // понедельник

const person = (
  personId: number,
  fullName: string,
  departmentName: string,
  specializationName: string,
): CalendarInputPersonType => ({
  personId,
  fullName,
  photoPath: null,
  departmentName,
  departmentColor: '#6366f1',
  specializationName,
});

const absence = (
  id: number,
  personId: number,
  fromDay: string,
  toDay: string,
): CalendarAbsenceType => ({ id, personId, fromDay, toDay, kind: 'отпуск' });

const firstGroup = (calendar: ReturnType<typeof buildAbsenceCalendar>) =>
  calendar.departments[0]?.groups[0];

describe('начало недели', () => {
  it('всегда понедельник', () => {
    expect(weekStart('2025-06-30')).toBe('2025-06-30'); // пн
    expect(weekStart('2025-07-06')).toBe('2025-06-30'); // вс той же недели
    expect(weekStart('2025-07-07')).toBe('2025-07-07'); // следующий пн
  });
});

describe('окно календаря', () => {
  it('берёт отпуск, который уже идёт, а не только будущий', () => {
    const calendar = buildAbsenceCalendar(
      [person(1, 'Егор', 'Бэкенд', 'Бэкенд')],
      [absence(1, 1, '2025-06-20', '2025-07-10')],
      TODAY,
    );
    expect(firstGroup(calendar)?.people[0]?.absences).toHaveLength(1);
  });

  it('не берёт отпуск целиком за пределами окна', () => {
    const calendar = buildAbsenceCalendar(
      [person(1, 'Егор', 'Бэкенд', 'Бэкенд')],
      [
        absence(1, 1, '2025-01-01', '2025-01-10'),
        absence(2, 1, '2026-01-01', '2026-01-10'),
      ],
      TODAY,
    );
    expect(firstGroup(calendar)?.people[0]?.absences).toHaveLength(0);
  });

  it('считает дни отсутствия только внутри окна', () => {
    const calendar = buildAbsenceCalendar(
      [person(1, 'Егор', 'Бэкенд', 'Бэкенд')],
      [absence(1, 1, '2025-09-25', '2025-11-01')],
      TODAY,
      90,
    );
    // Окно кончается 2025-09-28, значит 25–28 сентября — 4 дня.
    expect(firstGroup(calendar)?.people[0]?.daysAway).toBe(4);
  });
});

describe('провалы в покрытии', () => {
  const three = [
    person(1, 'Артём', 'Мобильные', 'iOS'),
    person(2, 'Марина', 'Мобильные', 'iOS'),
    person(3, 'Данила', 'Мобильные', 'iOS'),
  ];

  it('не считает провалом отпуска, попавшие в одну неделю, но не пересёкшиеся', () => {
    // Главная ошибка недельной агрегации: «кто-нибудь отсутствовал на этой
    // неделе» и «сколько человек нет в один день» — разные числа.
    const calendar = buildAbsenceCalendar(
      three,
      [
        absence(1, 1, '2025-07-07', '2025-07-09'), // пн–ср
        absence(2, 2, '2025-07-10', '2025-07-13'), // чт–вс той же недели
      ],
      TODAY,
    );
    expect(firstGroup(calendar)?.gaps).toEqual([]);
  });

  it('находит отрезок реального пересечения по дням', () => {
    const calendar = buildAbsenceCalendar(
      three,
      [
        absence(1, 1, '2025-07-07', '2025-07-11'),
        absence(2, 2, '2025-07-09', '2025-07-15'),
      ],
      TODAY,
    );
    const gaps = firstGroup(calendar)?.gaps ?? [];
    expect(gaps).toHaveLength(1);
    // Пересечение — ровно 9–11 июля, а не вся неделя.
    expect(gaps[0]).toMatchObject({
      fromDay: '2025-07-09',
      toDay: '2025-07-11',
      awayCount: 2,
      total: 3,
    });
  });

  it('берёт пик одновременно отсутствующих на отрезке', () => {
    const calendar = buildAbsenceCalendar(
      three,
      [
        absence(1, 1, '2025-07-07', '2025-07-15'),
        absence(2, 2, '2025-07-08', '2025-07-14'),
        absence(3, 3, '2025-07-10', '2025-07-11'),
      ],
      TODAY,
    );
    expect(firstGroup(calendar)?.gaps[0]?.awayCount).toBe(3);
  });

  it('не считает провалом одного отсутствующего, сколько бы ни был мал отдел', () => {
    // Один в отпуске — это просто отпуск. Проблема начинается, когда
    // некому подменить.
    const calendar = buildAbsenceCalendar(
      [person(1, 'Света', 'Качество', 'QA'), person(2, 'Рома', 'Качество', 'QA')],
      [absence(1, 1, '2025-07-07', '2025-07-11')],
      TODAY,
    );
    expect(firstGroup(calendar)?.gaps).toEqual([]);
  });

  it('не считает провалом двоих из большой группы', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      person(i + 1, `Человек ${i + 1}`, 'Бэкенд', 'Бэкенд'),
    );
    const calendar = buildAbsenceCalendar(
      many,
      [
        absence(1, 1, '2025-07-07', '2025-07-11'),
        absence(2, 2, '2025-07-07', '2025-07-11'),
      ],
      TODAY,
    );
    expect(firstGroup(calendar)?.gaps).toEqual([]);
  });

  it('разбивает на два отрезка, если между пересечениями был перерыв', () => {
    const calendar = buildAbsenceCalendar(
      three,
      [
        absence(1, 1, '2025-07-07', '2025-07-08'),
        absence(2, 2, '2025-07-07', '2025-07-08'),
        absence(3, 1, '2025-07-20', '2025-07-21'),
        absence(4, 2, '2025-07-20', '2025-07-21'),
      ],
      TODAY,
    );
    expect(firstGroup(calendar)?.gaps.map((g) => g.fromDay)).toEqual([
      '2025-07-07',
      '2025-07-20',
    ]);
  });
});

describe('группировка', () => {
  it('делит отдел по специализациям — подменяют только своих', () => {
    // Двое iOS в отпуске это провал, даже если андроидчики на месте:
    // андроидчик не закроет iOS.
    const calendar = buildAbsenceCalendar(
      [
        person(1, 'Артём', 'Мобильные', 'iOS'),
        person(2, 'Марина', 'Мобильные', 'iOS'),
        person(3, 'Оля', 'Мобильные', 'Android'),
        person(4, 'Кирилл', 'Мобильные', 'Android'),
      ],
      [
        absence(1, 1, '2025-07-07', '2025-07-11'),
        absence(2, 2, '2025-07-07', '2025-07-11'),
      ],
      TODAY,
    );

    const groups = calendar.departments[0]?.groups ?? [];
    expect(groups.map((g) => g.label)).toEqual([
      'Мобильные · Android',
      'Мобильные · iOS',
    ]);

    const ios = groups.find((g) => g.specializationName === 'iOS');
    const android = groups.find((g) => g.specializationName === 'Android');
    expect(ios?.gaps).toHaveLength(1);
    expect(android?.gaps).toHaveLength(0);
  });

  it('людей без отдела и специализации не теряет', () => {
    const calendar = buildAbsenceCalendar(
      [
        {
          personId: 1,
          fullName: 'Ничей',
          photoPath: null,
          departmentName: null,
          departmentColor: null,
          specializationName: null,
        },
      ],
      [],
      TODAY,
    );
    expect(calendar.departments[0]?.name).toBe('Без отдела');
    expect(calendar.departments[0]?.groups[0]?.specializationName).toBe(
      'Без специализации',
    );
  });

  it('внутри группы сортирует по числу дней отсутствия', () => {
    const calendar = buildAbsenceCalendar(
      [
        person(1, 'Мало', 'Бэкенд', 'Бэкенд'),
        person(2, 'Много', 'Бэкенд', 'Бэкенд'),
      ],
      [
        absence(1, 1, '2025-07-01', '2025-07-02'),
        absence(2, 2, '2025-07-01', '2025-07-20'),
      ],
      TODAY,
    );
    expect(firstGroup(calendar)?.people.map((p) => p.fullName)).toEqual([
      'Много',
      'Мало',
    ]);
  });
});

describe('структура календаря', () => {
  it('разбивает окно на месяцы с правильной длиной', () => {
    const calendar = buildAbsenceCalendar([], [], '2025-06-30', 90);
    expect(calendar.months.map((m) => m.label)).toEqual([
      'июнь',
      'июль',
      'август',
      'сентябрь',
    ]);
    expect(calendar.months.map((m) => m.days)).toEqual([1, 31, 31, 28]);
    expect(calendar.totalDays).toBe(91);
  });
});
