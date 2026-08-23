import { eq, inArray } from 'drizzle-orm';

import { ensureDefaultAttributes } from '../repositories/assessments.js';
import { ensureDefaultKarmaCategories } from '../repositories/karma-categories.js';
import { db, sqlite } from './index.js';
import {
  karmaCategories as karmaCategoriesTable,
  absences,
  assessments,
  attributes,
  gradeExpectations,
  climateCheckins,
  commitments,
  departments,
  developmentGoals,
  DEFAULT_KARMA_CATEGORIES,
  grades,
  karmaEntries,
  noteBlocks,
  oneOnOnes,
  people,
  personEvents,
  specializations,
  issues,
} from './schema.js';
import { addDays, today, type DayType } from '../domain/dates.js';

/**
 * Данные за девять месяцев. Без истории такой глубины невозможно ни увидеть
 * тренды климата, ни понять, срабатывают ли алерты на правдоподобных, а не
 * на выдуманных состояниях.
 *
 * Состав подобран так, чтобы дашборд сразу показывал разные ситуации:
 * выгорающий сеньор, новичок без единого 1-1, человек в отпуске (по нему
 * алертов быть не должно), сломанное обещание лида, тихая середина.
 */

/** Детерминированный ГПСЧ: один и тот же seed даёт одну и ту же базу. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const random = makeRandom(20_260_821);
const TODAY = today();
const ago = (days: number): DayType => addDays(TODAY, -days);

function clampScale(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

type SeedPersonType = {
  fullName: string;
  spec: string;
  grade: string;
  hiredDaysAgo: number;
  cadenceDays: number;
  birthdayDaysAhead?: number;
  /** Тренд мотивации за 9 месяцев: откуда и куда идёт. */
  motivation: [number, number];
  workload: [number, number];
  satisfaction: [number, number];
  /** Сколько дней назад был последний 1-1; null — не было ни одного. */
  lastMeetingDaysAgo: number | null;
  flightRisk?: 'низкий' | 'средний' | 'высокий';
  probationEndsInDays?: number;
  vacation?: [number, number];
  karmaRate: number;
};

const SEED_PEOPLE: readonly SeedPersonType[] = [
  {
    fullName: 'Артём Ковалёв',
    spec: 'iOS',
    grade: 'Senior',
    hiredDaysAgo: 900,
    cadenceDays: 21,
    motivation: [5, 2],
    workload: [3, 5],
    satisfaction: [5, 2],
    lastMeetingDaysAgo: 41,
    flightRisk: 'высокий',
    karmaRate: 0.5,
  },
  {
    fullName: 'Марина Соловьёва',
    spec: 'iOS',
    grade: 'Middle',
    hiredDaysAgo: 420,
    cadenceDays: 14,
    motivation: [3, 4],
    workload: [3, 3],
    satisfaction: [3, 4],
    lastMeetingDaysAgo: 9,
    karmaRate: 0.7,
    birthdayDaysAhead: 4,
  },
  {
    fullName: 'Данила Пряхин',
    spec: 'iOS',
    grade: 'Junior',
    hiredDaysAgo: 21,
    cadenceDays: 7,
    motivation: [4, 4],
    workload: [2, 3],
    satisfaction: [4, 4],
    lastMeetingDaysAgo: null,
    probationEndsInDays: 9,
    karmaRate: 0.2,
  },
  {
    fullName: 'Ольга Ветрова',
    spec: 'Android',
    grade: 'Senior',
    hiredDaysAgo: 1100,
    cadenceDays: 21,
    motivation: [4, 4],
    workload: [3, 3],
    satisfaction: [4, 4],
    lastMeetingDaysAgo: 12,
    karmaRate: 1.1,
  },
  {
    fullName: 'Кирилл Дёмин',
    spec: 'Android',
    grade: 'Middle',
    hiredDaysAgo: 500,
    cadenceDays: 14,
    motivation: [4, 3],
    workload: [3, 3],
    satisfaction: [4, 3],
    lastMeetingDaysAgo: 26,
    karmaRate: 0.4,
  },
  {
    fullName: 'Настя Гурьева',
    spec: 'Android',
    grade: 'Junior',
    hiredDaysAgo: 150,
    cadenceDays: 10,
    motivation: [3, 5],
    workload: [2, 3],
    satisfaction: [3, 5],
    lastMeetingDaysAgo: 6,
    karmaRate: 0.9,
  },
  {
    fullName: 'Павел Ершов',
    spec: 'Бэкенд',
    grade: 'Lead',
    hiredDaysAgo: 1400,
    cadenceDays: 21,
    motivation: [4, 4],
    workload: [4, 3],
    satisfaction: [4, 4],
    lastMeetingDaysAgo: 15,
    karmaRate: 1.3,
  },
  {
    fullName: 'Егор Лапин',
    spec: 'Бэкенд',
    grade: 'Senior',
    hiredDaysAgo: 700,
    cadenceDays: 21,
    motivation: [4, 4],
    workload: [3, 3],
    satisfaction: [4, 4],
    lastMeetingDaysAgo: 30,
    vacation: [3, 14],
    karmaRate: 0.6,
  },
  {
    fullName: 'Юля Мещерякова',
    spec: 'Бэкенд',
    grade: 'Middle',
    hiredDaysAgo: 380,
    cadenceDays: 14,
    motivation: [3, 3],
    workload: [3, 3],
    satisfaction: [3, 3],
    lastMeetingDaysAgo: 11,
    karmaRate: 0.3,
  },
  {
    fullName: 'Света Аникина',
    spec: 'QA',
    grade: 'Senior',
    hiredDaysAgo: 950,
    cadenceDays: 14,
    motivation: [4, 3],
    workload: [4, 5],
    satisfaction: [4, 3],
    lastMeetingDaysAgo: 19,
    flightRisk: 'средний',
    karmaRate: 0.8,
  },
  {
    fullName: 'Рома Плетнёв',
    spec: 'QA',
    grade: 'Middle',
    hiredDaysAgo: 300,
    cadenceDays: 14,
    motivation: [4, 4],
    workload: [3, 3],
    satisfaction: [4, 4],
    lastMeetingDaysAgo: 13,
    karmaRate: 0.5,
  },
  {
    fullName: 'Лиза Бортникова',
    spec: 'QA',
    grade: 'Junior',
    hiredDaysAgo: 95,
    cadenceDays: 10,
    motivation: [3, 4],
    workload: [2, 3],
    satisfaction: [3, 4],
    lastMeetingDaysAgo: 8,
    karmaRate: 0.4,
  },
];

/**
 * Формулировки безличные: в команде есть и мужские, и женские имена, а
 * «Настя Гурьева — Сократил прогон CI» читается как сломанные данные и
 * подрывает доверие ко всему остальному на экране.
 */
const KARMA_TEXTS: Record<string, string[]> = {
  'помощь коллеге': [
    'Полдня на то, чтобы поднять новичку окружение',
    'Помощь соседней команде с падающими тестами',
    'Ревью за уехавшего коллегу, без просьбы',
  ],
  инициатива: [
    'Метрики крешей на дашборде — идея и реализация без задачи',
    'Дыра в аналитике замечена и заведена до того, как спросили',
    'Разбор инцидента, хотя никто не просил',
  ],
  'тушение пожара': [
    'Выход в выходной чинить прод',
    'Авария с очередью разгребена за вечер',
    'Релиз удержан, пока остальные были на конференции',
  ],
  менторство: [
    'Ведёт джуна вторую неделю без напоминаний',
    'Внутренний воркшоп по тестированию',
    'Разбор архитектуры нового модуля с командой',
  ],
  'улучшение процесса': [
    'Прогон CI сокращён с 22 до 9 минут',
    'Шаблон описания задачи — вопросов стало заметно меньше',
    'Ручная выкатка стенда автоматизирована',
  ],
};

const COMMITMENT_TITLES = {
  i_owe: [
    'Обсудить пересмотр грейда',
    'Дать доступ к продовой аналитике',
    'Собрать фидбек от смежной команды',
    'Договориться про конференцию',
    'Разгрузить от дежурств на спринт',
  ],
  they_owe: [
    'Дописать документацию по модулю',
    'Взять на себя онбординг новичка',
    'Разобрать долг по автотестам',
    'Подготовить разбор инцидента',
    'Составить план обучения на квартал',
  ],
} as const;

/**
 * Очистка перед наполнением — только своей команды.
 *
 * Раньше эти таблицы чистились целиком: при одном пользователе разницы не
 * было, а с несколькими это означало бы, что запуск сида ради демо сносит
 * данные всех остальных. Строки, привязанные к человеку, уходят каскадом
 * вслед за людьми команды.
 */
function wipe(teamId: number): void {
  // Порядок важен: departments → specializations стоит restrict, а не
  // cascade. Это защита оценок от случайного сноса вместе со справочником,
  // и здесь она означает, что специализации надо убрать раньше отделов.
  const departmentIds = db
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.teamId, teamId))
    .all()
    .map((row) => row.id);

  // Люди первыми: за ними каскадом уходят оценки, встречи, обязательства,
  // заметки, карма, отсутствия и события.
  db.delete(people).where(eq(people.teamId, teamId)).run();

  // Атрибуты раньше специализаций: у общих специализации нет вовсе, а с
  // ними каскадом снимаются и ожидания по грейдам.
  db.delete(attributes).where(eq(attributes.teamId, teamId)).run();

  if (departmentIds.length > 0) {
    db.delete(specializations)
      .where(inArray(specializations.departmentId, departmentIds))
      .run();
  }

  db.delete(departments).where(eq(departments.teamId, teamId)).run();
  db.delete(grades).where(eq(grades.teamId, teamId)).run();
  db.delete(karmaCategoriesTable).where(eq(karmaCategoriesTable.teamId, teamId)).run();
}

function wipeUnused(): void {
  for (const table of [
    assessments,
    gradeExpectations,
    attributes,
    karmaEntries,
    climateCheckins,
    commitments,
    developmentGoals,
    noteBlocks,
    absences,
    personEvents,
    oneOnOnes,
    people,
    specializations,
    departments,
    grades,
  ]) {
    db.delete(table).run();
  }
  sqlite.exec("DELETE FROM sqlite_sequence WHERE name NOT LIKE '\\_%' ESCAPE '\\'");
}

/**
 * Оценки-снимки за 9 месяцев с ростом от грейда. Один человек намеренно
 * оставлен недооценённым — карточка должна показывать `??`, и это состояние
 * надо видеть на экране, а не только в тесте.
 */
function seedAssessments(): void {
  const core = db.select().from(attributes).where(eq(attributes.kind, 'core')).all();
  const skills = db.select().from(attributes).where(eq(attributes.kind, 'skill')).all();
  const gradeById = new Map(db.select().from(grades).all().map((g) => [g.id, g]));

  let count = 0;

  for (const person of db.select().from(people).all()) {
    const grade = person.gradeId ? gradeById.get(person.gradeId) : null;
    const base = grade ? Math.min(4, grade.level + 1) : 2;

    // Данила Пряхин — новичок 21 дня: его не успели оценить.
    if (person.fullName === 'Данила Пряхин') continue;

    const personSkills = skills.filter(
      (s) => s.specializationId === person.specializationId,
    );

    for (const attribute of [...core, ...personSkills]) {
      // Два снимка: полгода назад и недавно — чтобы был виден рост.
      const older = clampScale(base - 1 + (random() - 0.5) * 1.4);
      const newer = clampScale(older + (random() < 0.55 ? 1 : 0));

      db.insert(assessments)
        .values({
          personId: person.id,
          attributeId: attribute.id,
          value: older,
          confidence: 'sure',
          evidence: 'Первая калибровка по итогам квартала',
          assessedAt: ago(190 + Math.floor(random() * 30)),
        })
        .run();

      db.insert(assessments)
        .values({
          personId: person.id,
          attributeId: attribute.id,
          value: newer,
          // Часть оценок — предположения: карточка обязана это показывать.
          confidence: random() < 0.25 ? 'assuming' : 'sure',
          evidence: pick([
            'По итогам последнего проекта',
            'Заметно вырос за квартал',
            'Подтвердилось на разборе инцидента',
            'Пока предполагаю, данных мало',
          ]),
          assessedAt: ago(10 + Math.floor(random() * 60)),
        })
        .run();

      count += 2;
    }
  }

  console.log(`  снимков оценок: ${count}`);
}

function seed(teamId: number): void {
  wipe(teamId);
  ensureDefaultKarmaCategories();

  const departmentRows = db
    .insert(departments)
    .values([
      { teamId, name: 'Мобильная разработка', color: '#6366f1', sortOrder: 1 },
      { teamId, name: 'Бэкенд', color: '#0ea5e9', sortOrder: 2 },
      { teamId, name: 'Качество', color: '#f59e0b', sortOrder: 3 },
    ])
    .returning()
    .all();

  const departmentByName = new Map(departmentRows.map((d) => [d.name, d.id]));

  const specializationRows = db
    .insert(specializations)
    .values([
      { name: 'iOS', departmentId: departmentByName.get('Мобильная разработка')!, sortOrder: 1 },
      { name: 'Android', departmentId: departmentByName.get('Мобильная разработка')!, sortOrder: 2 },
      { name: 'Бэкенд', departmentId: departmentByName.get('Бэкенд')!, sortOrder: 1 },
      { name: 'QA', departmentId: departmentByName.get('Качество')!, sortOrder: 1 },
    ])
    .returning()
    .all();

  const specByName = new Map(specializationRows.map((s) => [s.name, s.id]));

  const gradeRows = db
    .insert(grades)
    .values([
      { teamId, name: 'Junior', level: 1 },
      { teamId, name: 'Middle', level: 2 },
      { teamId, name: 'Senior', level: 3 },
      { teamId, name: 'Lead', level: 4 },
    ])
    .returning()
    .all();

  const gradeByName = new Map(gradeRows.map((g) => [g.name, g.id]));

  let meetingCount = 0;
  let checkinCount = 0;
  let commitmentCount = 0;
  let karmaCount = 0;

  for (const seedPerson of SEED_PEOPLE) {
    const hiredAt = ago(seedPerson.hiredDaysAgo);

    const person = db
      .insert(people)
      .values({
        teamId,
        fullName: seedPerson.fullName,
        specializationId: specByName.get(seedPerson.spec)!,
        gradeId: gradeByName.get(seedPerson.grade)!,
        hiredAt,
        cadenceDays: seedPerson.cadenceDays,
        probationEndsAt:
          seedPerson.probationEndsInDays === undefined
            ? null
            : addDays(TODAY, seedPerson.probationEndsInDays),
        birthday:
          seedPerson.birthdayDaysAhead === undefined
            ? null
            : `1992-${addDays(TODAY, seedPerson.birthdayDaysAhead).slice(5)}`,
      })
      .returning()
      .get();

    db.insert(personEvents)
      .values({ personId: person.id, kind: 'hired', at: hiredAt })
      .run();

    if (seedPerson.vacation) {
      const [startAgo, length] = seedPerson.vacation;
      db.insert(absences)
        .values({
          personId: person.id,
          fromDay: ago(startAgo),
          toDay: addDays(ago(startAgo), length),
          kind: 'отпуск',
        })
        .run();
    }

    if (seedPerson.flightRisk) {
      db.insert(noteBlocks)
        .values({
          personId: person.id,
          kind: 'flight_risk',
          value: seedPerson.flightRisk,
          content:
            seedPerson.flightRisk === 'высокий'
              ? 'Дважды упоминал, что «засиделся». Пишут рекрутеры, не отрицает.'
              : 'Недоволен нагрузкой, но за компанию держится.',
          isSensitive: true,
        })
        .run();
    }

    db.insert(noteBlocks)
      .values({
        personId: person.id,
        kind: 'career_goal',
        content: `Хочет вырасти дальше ${seedPerson.grade}, интересна архитектура`,
        reviewAt: addDays(TODAY, Math.floor(random() * 120) - 30),
      })
      .run();

    // --- история встреч и замеров климата за 9 месяцев ---
    const historyDays = Math.min(270, seedPerson.hiredDaysAgo);
    const meetingDays: number[] = [];
    if (seedPerson.lastMeetingDaysAgo !== null) {
      for (
        let daysAgoValue = seedPerson.lastMeetingDaysAgo;
        daysAgoValue < historyDays;
        daysAgoValue += seedPerson.cadenceDays + Math.floor(random() * 5) - 2
      ) {
        meetingDays.push(daysAgoValue);
      }
    }

    for (const daysAgoValue of meetingDays) {
      // Прогресс от 0 (девять месяцев назад) до 1 (сегодня) — по нему
      // интерполируются тренды, чтобы графики не были случайным шумом.
      const progress = 1 - daysAgoValue / Math.max(1, historyDays);
      const at = ago(daysAgoValue);

      const meeting = db
        .insert(oneOnOnes)
        .values({
          personId: person.id,
          happenedAt: at,
          status: 'done',
          notes:
            random() > 0.35
              ? pick([
                  'Обсудили текущий проект, всё в рабочем режиме.',
                  'Говорили про рост и что нужно для следующего грейда.',
                  'Жалобы на количество переключений между задачами.',
                  'Разобрали конфликтную ситуацию на ревью.',
                  'Хочет больше влиять на архитектурные решения.',
                ])
              : null,
          durationMinutes: 30 + Math.floor(random() * 4) * 15,
        })
        .returning()
        .get();
      meetingCount += 1;

      // Разброс должен быть достаточным, чтобы сдвинуть округлённое значение
      // даже при ровном тренде: иначе у половины команды график выходит
      // идеально плоской линией и выглядит сломанным.
      const lerp = ([from, to]: [number, number]) =>
        clampScale(from + (to - from) * progress + (random() - 0.5) * 1.4);

      db.insert(climateCheckins)
        .values({
          personId: person.id,
          oneOnOneId: meeting.id,
          measuredAt: at,
          motivation: lerp(seedPerson.motivation),
          workloadPressure: lerp(seedPerson.workload),
          satisfaction: lerp(seedPerson.satisfaction),
        })
        .run();
      checkinCount += 1;

      // Старые договорённости всегда чем-то закончились — открытыми остаются
      // только свежие. Иначе накапливается десяток «моих» долгов с просрочкой
      // в полгода: дашборд краснеет целиком, все карточки становятся
      // критичными, и сортировка по важности перестаёт что-либо значить.
      if (random() < 0.45) {
        const direction = random() < 0.5 ? 'i_owe' : 'they_owe';
        const isOld = daysAgoValue > 45;
        const resolvedAsDone = random() < 0.85;
        const status = isOld ? (resolvedAsDone ? 'done' : 'cancelled') : 'open';

        db.insert(commitments)
          .values({
            personId: person.id,
            oneOnOneId: meeting.id,
            direction,
            title: pick(COMMITMENT_TITLES[direction]),
            dueAt: addDays(at, 14),
            status,
            completedAt: status === 'done' ? addDays(at, 10) : null,
          })
          .run();
        commitmentCount += 1;
      }
    }

    // --- карма ---
    const karmaEntriesCount = Math.round(seedPerson.karmaRate * 9);
    for (let i = 0; i < karmaEntriesCount; i += 1) {
      const category = pick(DEFAULT_KARMA_CATEGORIES);
      db.insert(karmaEntries)
        .values({
          personId: person.id,
          category,
          description: pick(KARMA_TEXTS[category] ?? ['Помог команде']),
          happenedAt: ago(Math.floor(random() * historyDays)),
        })
        .run();
      karmaCount += 1;
    }

    // --- следующая встреча ---
    if (seedPerson.lastMeetingDaysAgo !== null) {
      const nextAt = addDays(
        ago(seedPerson.lastMeetingDaysAgo),
        seedPerson.cadenceDays,
      );
      db.insert(oneOnOnes)
        .values({
          personId: person.id,
          plannedAt: nextAt > TODAY ? nextAt : addDays(TODAY, 1 + Math.floor(random() * 6)),
          status: 'planned',
        })
        .run();
    }

    if (random() < 0.4) {
      db.insert(developmentGoals)
        .values({
          personId: person.id,
          title: pick([
            'Вырасти до следующего грейда',
            'Взять на себя техлидство в проекте',
            'Закрыть пробел по системному дизайну',
            'Начать менторить джуна',
          ]),
          startedAt: ago(Math.floor(random() * 120) + 30),
          targetAt: addDays(TODAY, Math.floor(random() * 120) - 20),
          status: random() < 0.25 ? 'буксует' : 'идёт',
        })
        .run();
    }
  }

  // --- будущие отпуска: календарь должен показывать пересечения ---
  // Двое из трёх мобильщиков iOS уходят внахлёст — ровно та неделя, ради
  // которой календарь и нужен.
  const plannedLeave: [string, number, number, (typeof absences.$inferInsert)['kind']][] = [
    ['Марина Соловьёва', 12, 14, 'отпуск'],
    ['Данила Пряхин', 16, 10, 'отпуск'],
    ['Ольга Ветрова', 30, 21, 'отпуск'],
    ['Света Аникина', 5, 3, 'больничный'],
    ['Рома Плетнёв', 45, 14, 'отпуск'],
    ['Юля Мещерякова', 47, 12, 'отпуск'],
    ['Павел Ершов', 70, 14, 'отпуск'],
  ];

  const peopleByName = new Map(
    db.select().from(people).all().map((p) => [p.fullName, p.id]),
  );

  for (const [name, startsIn, length, kind] of plannedLeave) {
    const personId = peopleByName.get(name);
    if (!personId) continue;

    db.insert(absences)
      .values({
        personId,
        fromDay: addDays(TODAY, startsIn),
        toDay: addDays(TODAY, startsIn + length),
        kind,
      })
      .run();
  }

  // --- сломанные обещания лида: главный сигнал на дашборде ---
  const artem = db.select().from(people).all().find((p) => p.fullName === 'Артём Ковалёв');
  const sveta = db.select().from(people).all().find((p) => p.fullName === 'Света Аникина');

  if (artem) {
    db.insert(commitments)
      .values({
        personId: artem.id,
        direction: 'i_owe',
        title: 'Вернуться с ответом по пересмотру зарплаты',
        details: 'Обещал ещё в прошлый раз, до сих пор нет ответа от финансов',
        dueAt: ago(19),
        status: 'open',
      })
      .run();
    commitmentCount += 1;
  }

  if (sveta) {
    db.insert(commitments)
      .values({
        personId: sveta.id,
        direction: 'i_owe',
        title: 'Снять с неё дежурства на спринт',
        dueAt: ago(4),
        status: 'open',
      })
      .run();
    commitmentCount += 1;
  }

  /**
   * Косяки: показываем оба состояния сразу.
   *
   * Непроговорённый и просроченный нужен обязательно — без него не видно
   * ни жёлтой отметки, ни сигнала на панели, то есть половина смысла
   * раздела остаётся невидимой на демо-данных.
   *
   * Формулировки безличные и без оценок вроде «безответственный»: запись
   * должна описывать событие, а не выносить приговор — иначе через полгода
   * читаешь собственное раздражение вместо фактов.
   */
  const SEED_ISSUES: { name: string; text: string; daysAgo: number; discussedDaysAgo: number | null }[] = [
    { name: 'Артём Ковалёв', text: 'Выкатил в пятницу без ревью, откатывали ночью', daysAgo: 23, discussedDaysAgo: null },
    { name: 'Света Аникина', text: 'Пропустила регресс — баг уехал на прод', daysAgo: 31, discussedDaysAgo: 24 },
    { name: 'Кирилл Дёмин', text: 'Сорвал срок и не предупредил заранее', daysAgo: 17, discussedDaysAgo: null },
    { name: 'Кирилл Дёмин', text: 'Оценка задачи разошлась втрое, не поднял флаг', daysAgo: 64, discussedDaysAgo: 58 },
    { name: 'Юля Мещерякова', text: 'Ушла в отпуск, не передав дежурство', daysAgo: 120, discussedDaysAgo: 115 },
  ];

  let issueCount = 0;
  for (const seedIssue of SEED_ISSUES) {
    const target = peopleByName.get(seedIssue.name);
    if (!target) continue;
    db.insert(issues)
      .values({
        personId: target,
        description: seedIssue.text,
        happenedAt: ago(seedIssue.daysAgo),
        discussedAt:
          seedIssue.discussedDaysAgo === null ? null : ago(seedIssue.discussedDaysAgo),
      })
      .run();
    issueCount += 1;
  }

  // Атрибуты заводятся после специализаций: скиллы к ним привязаны.
  ensureDefaultAttributes();
  seedAssessments();

  console.log('База наполнена:');
  console.log(`  людей: ${SEED_PEOPLE.length}`);
  console.log(`  встреч 1-1: ${meetingCount}`);
  console.log(`  замеров климата: ${checkinCount}`);
  console.log(`  обязательств: ${commitmentCount}`);
  console.log(`  записей кармы: ${karmaCount}`);
  console.log(`  косяков: ${issueCount}`);
}

export { seed };
