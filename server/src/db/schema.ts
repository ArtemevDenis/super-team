import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Соглашение по датам, нарушение которого ломает алерты:
 *   day  — TEXT 'YYYY-MM-DD', календарный день без времени и зоны
 *   ts   — TEXT ISO UTC, момент времени
 * Всё, по чему считается «просрочено» (due_at, happened_at, planned_at,
 * assessed_at), обязано быть day: иначе UTC-таймстемп даёт сдвиг на сутки
 * половину суток по Москве, и алерты начинают врать.
 */
const day = (name: string) => text(name);
const ts = (name: string) => text(name);

const timestamps = {
  createdAt: ts('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: ts('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
};

/* ------------------------------------------------------------------ */
/* Пользователи и сессии                                               */
/* ------------------------------------------------------------------ */

/**
 * Пользователь — владелец своих команд и больше ничей.
 *
 * Регистрации из интернета нет: аккаунт заводится командой `user:add` на
 * сервере. Двум людям поток приглашений не нужен, а публичный эндпоинт
 * регистрации — это класс уязвимостей, которого можно просто не иметь.
 *
 * Активная команда и режим показа экрана живут здесь, а не в общих
 * настройках: раньше это были свойства сервера, и с двумя пользователями
 * один переключал команду — а у второго менялся экран посреди встречи.
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  activeTeamId: integer('active_team_id'),
  presentationMode: integer('presentation_mode', { mode: 'boolean' })
    .notNull()
    .default(false),
  /**
   * Демо-аккаунт: пароль опубликован намеренно, данные выдуманы.
   *
   * Флаг нужен не для витрины, а ради трёх исключений, каждое из которых
   * иначе выглядело бы дырой:
   *
   * 1. Пароль короче обязательных 12 символов — потому что его смысл в том,
   *    чтобы его знали все.
   * 2. Смена пароля запрещена: пароль публичный, и первый зашедший иначе
   *    сменил бы его и запер демо от всех остальных.
   * 3. Счётчик неудачных попыток по этой почте не ведётся: защищать
   *    известный пароль от подбора нечего, а вот запереть демо восемью
   *    заведомо неверными попытками смог бы кто угодно.
   */
  isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

/**
 * Сессии.
 *
 * В базе лежит хэш токена, а не сам токен: утечка файла базы не должна
 * давать готовый вход. Клиенту токен уходит один раз в httpOnly-куке.
 */
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  lastSeenAt: ts('last_seen_at').notNull(),
  createdAt: ts('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/**
 * Попытки входа — троттлинг перебора.
 *
 * На публичном хосте форма входа доступна всему интернету, а пользователей
 * двое: без ограничения подбор пароля упирается только в скорость scrypt.
 * Считаем и по почте, и по адресу — иначе перебор с одного адреса по
 * разным почтам проходит мимо счётчика.
 */
export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  ip: text('ip').notNull(),
  attemptedAt: ts('attempted_at').notNull(),
});

/* ------------------------------------------------------------------ */
/* Команды                                                             */
/* ------------------------------------------------------------------ */

/**
 * Команда — изолированное пространство: свои люди, отделы, грейды,
 * атрибуты, категории кармы и настройки алертов.
 *
 * Изоляция полная по решению: команды могут жить по разным правилам, и
 * общий справочник грейдов навязывал бы одной из них чужую линейку.
 * Плата за это — невозможность сравнивать команды между собой.
 *
 * Владелец ровно один. Из этого следует, что «я» в обещаниях, карме и
 * самоаудите однозначно, и авторство в таблицах фактов не нужно.
 */
export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

/**
 * Ссылка на команду. Значение по умолчанию нужно только для миграции уже
 * существующих строк — новые записи всегда получают команду явно.
 */
const teamRef = () =>
  integer('team_id')
    .notNull()
    .default(1)
    .references(() => teams.id, { onDelete: 'cascade' });

/* ------------------------------------------------------------------ */
/* Структура команды                                                   */
/* ------------------------------------------------------------------ */

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: teamRef(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#64748b'),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Скрытие вместо удаления: см. комментарий у specializations. */
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

export const specializations = sqliteTable(
  'specializations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Специализации скрываются, а не удаляются.
     *
     * От неё каскадом идут skill-атрибуты, а от них — снимки оценок. Одно
     * удаление специализации молча уничтожает всю историю оценок по её
     * компетенциям, и восстановить её неоткуда.
     */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('specializations_dept_name').on(t.departmentId, t.name)],
);

export const grades = sqliteTable(
  'grades',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamId: teamRef(),
    name: text('name').notNull(),
    /** Порядковый уровень: по нему ищется «следующий грейд». */
    level: integer('level').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('grades_team_level').on(t.teamId, t.level)],
);

/* ------------------------------------------------------------------ */
/* Люди                                                                */
/* ------------------------------------------------------------------ */

export const personStatuses = ['active', 'archived'] as const;

/**
 * Смежник — человек не в подчинении: PM, PO, лид соседней команды.
 *
 * Заведён признаком у человека, а не отдельной таблицей: вся механика
 * встреч, обязательств и заметок уже завязана на person_id, и дублировать
 * её ради второго типа значило бы удвоить половину схемы.
 *
 * Смежникам не ставятся оценки, замеры настроя, карма и грейды — их не
 * оценивают, с ними договариваются.
 */
export const personKinds = ['member', 'peer'] as const;
export const flightRiskLevels = ['низкий', 'средний', 'высокий'] as const;

export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamId: teamRef(),
    fullName: text('full_name').notNull(),
    kind: text('kind', { enum: personKinds }).notNull().default('member'),
    /** Роль смежника словами: он вне твоей структуры отделов. */
    externalRole: text('external_role'),
    specializationId: integer('specialization_id').references(
      () => specializations.id,
      { onDelete: 'set null' },
    ),
    gradeId: integer('grade_id').references(() => grades.id, {
      onDelete: 'set null',
    }),
    photoPath: text('photo_path'),
    hiredAt: day('hired_at'),
    probationEndsAt: day('probation_ends_at'),
    birthday: day('birthday'),
    /** Личная каденция 1-1 в днях: новичку 7, стабильному сеньору 21. */
    cadenceDays: integer('cadence_days').notNull().default(14),
    status: text('status', { enum: personStatuses }).notNull().default('active'),
    /** Реальный последний рабочий день — не то же самое, что archivedAt. */
    leftAt: day('left_at'),
    archivedAt: ts('archived_at'),
    archiveReason: text('archive_reason'),
    /**
     * Гистерезис матрицы Skill × Will: квадрант меняется только при
     * пересечении порога с запасом, иначе один чекин перекидывает человека
     * из «делегируй» в «тяжёлый разговор» и советы читаются как случайные.
     */
    lastQuadrant: text('last_quadrant'),
    lastQuadrantAt: ts('last_quadrant_at'),
    ...timestamps,
  },
  (t) => [
    index('people_status').on(t.status),
    check(
      'people_archived_consistency',
      sql`(${t.status} = 'active' AND ${t.archivedAt} IS NULL)
          OR (${t.status} = 'archived' AND ${t.archivedAt} IS NOT NULL)`,
    ),
  ],
);

export const personEventKinds = [
  'hired',
  'grade_change',
  'specialization_change',
  'probation_passed',
  'left',
  'returned',
] as const;

/**
 * grade_id и specialization_id мутабельны — без журнала событий история
 * роста теряется безвозвратно, а «сколько человек я вырастил за год»
 * становится неотвечаемым вопросом. Пишется только из repositories/people.ts.
 */
export const personEvents = sqliteTable(
  'person_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: personEventKinds }).notNull(),
    at: day('at').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('person_events_person').on(t.personId, t.at)],
);

export const absenceKinds = ['отпуск', 'больничный', 'другое'] as const;

/**
 * Без отсутствий алерты каденции орут про человека, который три недели
 * в отпуске. Один заведомо ложный алерт учит игнорировать всю ленту.
 */
export const absences = sqliteTable(
  'absences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    fromDay: day('from_day').notNull(),
    toDay: day('to_day').notNull(),
    kind: text('kind', { enum: absenceKinds }).notNull().default('отпуск'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('absences_person').on(t.personId, t.fromDay)],
);

/* ------------------------------------------------------------------ */
/* Встречи, климат, обязательства                                      */
/* ------------------------------------------------------------------ */

export const oneOnOneStatuses = ['planned', 'done', 'skipped'] as const;

export const oneOnOnes = sqliteTable(
  'one_on_ones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    plannedAt: day('planned_at'),
    happenedAt: day('happened_at'),
    status: text('status', { enum: oneOnOneStatuses })
      .notNull()
      .default('planned'),
    agenda: text('agenda'),
    notes: text('notes'),
    durationMinutes: integer('duration_minutes'),
    isSensitive: integer('is_sensitive', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [
    index('one_on_ones_person').on(t.personId, t.happenedAt),
    index('one_on_ones_status').on(t.status, t.plannedAt),
  ],
);

/**
 * Знаки осей разные: motivation и satisfaction — «больше значит лучше»,
 * workloadPressure — «больше значит хуже» (5 = перегружен). Читать только
 * через domain/climate.ts:toGoodness(), иначе однажды получится тепловая
 * карта с инвертированной колонкой, и заметишь это через полгода.
 */
export const climateCheckins = sqliteTable(
  'climate_checkins',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    oneOnOneId: integer('one_on_one_id').references(() => oneOnOnes.id, {
      onDelete: 'set null',
    }),
    measuredAt: day('measured_at').notNull(),
    motivation: integer('motivation').notNull(),
    workloadPressure: integer('workload_pressure').notNull(),
    satisfaction: integer('satisfaction').notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('climate_person').on(t.personId, t.measuredAt)],
);

export const commitmentDirections = ['i_owe', 'they_owe'] as const;
export const commitmentStatuses = [
  'open',
  'done',
  'cancelled',
  'snoozed',
] as const;

/** cancelled — это отменённая договорённость, а не сломанное обещание. */
export const commitments = sqliteTable(
  'commitments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    oneOnOneId: integer('one_on_one_id').references(() => oneOnOnes.id, {
      onDelete: 'set null',
    }),
    direction: text('direction', { enum: commitmentDirections }).notNull(),
    title: text('title').notNull(),
    details: text('details'),
    dueAt: day('due_at'),
    status: text('status', { enum: commitmentStatuses })
      .notNull()
      .default('open'),
    completedAt: day('completed_at'),
    snoozedUntil: day('snoozed_until'),
    ...timestamps,
  },
  (t) => [
    index('commitments_person').on(t.personId, t.status),
    index('commitments_due').on(t.status, t.dueAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Память о человеке                                                   */
/* ------------------------------------------------------------------ */

export const noteBlockKinds = [
  'career_goal',
  'motivators',
  'demotivators',
  'flight_risk',
  'i_owe_long_term',
] as const;

export const noteBlocks = sqliteTable(
  'note_blocks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: noteBlockKinds }).notNull(),
    content: text('content'),
    /** Для flight_risk здесь enum-уровень: он кормит алерты, а не текст. */
    value: text('value'),
    reviewAt: day('review_at'),
    /** Отличается от updatedAt: переподтвердить без правки — тоже событие. */
    confirmedAt: day('confirmed_at'),
    isSensitive: integer('is_sensitive', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('note_blocks_person_kind').on(t.personId, t.kind)],
);

/** Набор по умолчанию; дальше редактируется в настройках. */
export const DEFAULT_KARMA_CATEGORIES = [
  'помощь коллеге',
  'инициатива',
  'тушение пожара',
  'менторство',
  'улучшение процесса',
] as const;

/**
 * Весов у категорий нет намеренно. Категория отвечает на вопрос «что это
 * было», а не «на сколько баллов»: числовой вес — это точность, которой
 * здесь нет, и он бы неизбежно превратил признание в подсчёт очков.
 * Значение записи несёт её описание, а не коэффициент.
 */
export const karmaCategories = sqliteTable('karma_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: teamRef(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  /** Категории не удаляются, а прячутся: иначе исчезнет история под ними. */
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/**
 * Только плюсы: минусы превратили бы инструмент в систему наказаний,
 * для проблем есть оценки и заметки.
 *
 * Категория хранится строкой, а не ссылкой на karma_categories: переименование
 * категории не должно задним числом переписывать смысл прошлых записей, а
 * удаление — обнулять историю. Строка фиксирует то, что было отмечено тогда.
 */
/**
 * Косяки — записи о том, что пошло не так.
 *
 * Зеркало кармы, но устроенное иначе, и намеренно:
 *
 * Без категорий. Категории породили бы статистику вида «три инцидента типа
 * X», а статистика зовёт к сравнению людей между собой. Свободный текст
 * оставляет запись заметкой, а не метрикой.
 *
 * Без веса и без тяжести. По той же причине: любое число здесь превратилось
 * бы в счёт к человеку.
 *
 * С датой разговора. Косяк важен, пока он не проговорён. Записанный и
 * молча накопленный — худшее, что может случиться: предъявить всё разом на
 * ревью хуже, чем не записывать вовсе. Поэтому необсуждённые видны всегда,
 * сколько бы им ни было времени, и напоминают о себе сигналом.
 *
 * Ни на одно число не влияет — ни на общий уровень, ни на Will. Иначе это
 * была бы оценка-наказание, а инструмент задуман помогать, а не судить.
 */
export const issues = sqliteTable(
  'issues',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    /** Встреча, на которой проговорили. Пусто — разговора ещё не было. */
    oneOnOneId: integer('one_on_one_id').references(() => oneOnOnes.id, {
      onDelete: 'set null',
    }),
    description: text('description').notNull(),
    happenedAt: day('happened_at').notNull(),
    /** День разговора. Пусто — висит непроговорённым. */
    discussedAt: day('discussed_at'),
    ...timestamps,
  },
  (t) => [index('issue_person').on(t.personId, t.happenedAt)],
);

export const karmaEntries = sqliteTable(
  'karma_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    oneOnOneId: integer('one_on_one_id').references(() => oneOnOnes.id, {
      onDelete: 'set null',
    }),
    category: text('category').notNull(),
    description: text('description').notNull(),
    happenedAt: day('happened_at').notNull(),
    ...timestamps,
  },
  (t) => [index('karma_person').on(t.personId, t.happenedAt)],
);

export const goalStatuses = [
  'не начата',
  'идёт',
  'буксует',
  'готово',
] as const;

/** Процента прогресса нет намеренно: его никогда не обновляют честно, а
 *  протухшее число потом отравляет формулу Will. */
export const developmentGoals = sqliteTable(
  'development_goals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    startedAt: day('started_at'),
    targetAt: day('target_at'),
    status: text('status', { enum: goalStatuses }).notNull().default('идёт'),
    ...timestamps,
  },
  (t) => [index('goals_person').on(t.personId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Оценки                                                              */
/* ------------------------------------------------------------------ */

export const attributeKinds = ['core', 'skill'] as const;
export const attributeAxes = ['skill', 'will', 'neutral'] as const;
export const confidenceLevels = ['sure', 'assuming'] as const;

/** Шкала одна на всё приложение (1..SCALE_MAX). Колонки scale_max нет:
 *  разные шкалы делают каждую формулу ветвистой, а сравнение атрибутов
 *  между собой — молча неверным. */
export const SCALE_MAX = 5;

export const attributes = sqliteTable(
  'attributes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamId: teamRef(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    /** Трёхбуквенная метка для карточки: ТЕХ, КОМ, ОТВ. */
    shortCode: text('short_code').notNull(),
    kind: text('kind', { enum: attributeKinds }).notNull(),
    /** У core-атрибутов null; у skill — специализация, к которой привязан. */
    specializationId: integer('specialization_id').references(
      () => specializations.id,
      { onDelete: 'cascade' },
    ),
    /**
     * Ось для матрицы Skill × Will. Без неё Skill вырождается в OVR,
     * мотивационные атрибуты считаются на обеих осях, и облако точек
     * схлопывается в диагональ — типовая причина, по которой самодельные
     * матрицы Skill/Will оказываются бесполезными.
     */
    axis: text('axis', { enum: attributeAxes }).notNull().default('neutral'),
    /** Что означает «3» по этому атрибуту — иначе оценки дрейфуют год к году. */
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index('attributes_kind').on(t.kind, t.specializationId)],
);

/** Снимки, а не текущее значение: рост — это то, ради чего всё затевалось. */
export const assessments = sqliteTable(
  'assessments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    attributeId: integer('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    confidence: text('confidence', { enum: confidenceLevels })
      .notNull()
      .default('sure'),
    evidence: text('evidence'),
    assessedAt: day('assessed_at').notNull(),
    ...timestamps,
  },
  (t) => [index('assessments_lookup').on(t.personId, t.attributeId, t.assessedAt)],
);

export const gradeExpectations = sqliteTable(
  'grade_expectations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gradeId: integer('grade_id')
      .notNull()
      .references(() => grades.id, { onDelete: 'cascade' }),
    attributeId: integer('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    expectedValue: integer('expected_value').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('grade_expectations_pair').on(t.gradeId, t.attributeId)],
);

/* ------------------------------------------------------------------ */
/* Связи и знания                                                      */
/* ------------------------------------------------------------------ */

export const relationKinds = ['mentorship', 'authority', 'tension'] as const;

/**
 * Только по-настоящему парные типы. Знаниевая зависимость сюда не входит:
 * автобусный фактор — свойство области знаний, а не пары людей, и на
 * вопрос «если Петя уйдёт, кто знает биллинг» ребро ответить не может.
 */
export const relations = sqliteTable(
  'relations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fromPersonId: integer('from_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    toPersonId: integer('to_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: relationKinds }).notNull(),
    strength: integer('strength').notNull().default(3),
    note: text('note'),
    isSensitive: integer('is_sensitive', { mode: 'boolean' })
      .notNull()
      .default(false),
    startedAt: day('started_at'),
    /** Менторство заканчивается, конфликты гасятся. Без даты окончания
     *  протухшие рёбра навсегда портят все производные метрики. */
    endedAt: day('ended_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('relations_unique').on(t.fromPersonId, t.toPersonId, t.kind),
    check('relations_no_self', sql`${t.fromPersonId} <> ${t.toPersonId}`),
  ],
);

export const knowledgeAreas = sqliteTable('knowledge_areas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  /** 1..3 — насколько больно, если область останется без носителя. */
  criticality: integer('criticality').notNull().default(2),
  note: text('note'),
  ...timestamps,
});

export const personKnowledge = sqliteTable(
  'person_knowledge',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    areaId: integer('area_id')
      .notNull()
      .references(() => knowledgeAreas.id, { onDelete: 'cascade' }),
    /** 1..4; носителем считается level >= 3. */
    level: integer('level').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('person_knowledge_pair').on(t.personId, t.areaId)],
);

/* ------------------------------------------------------------------ */
/* Служебное                                                           */
/* ------------------------------------------------------------------ */

/**
 * Единственное хранимое состояние алертов. Ручного «скрыть навсегда» нет
 * намеренно: алерт гаснет только когда меняется факт, иначе появляется
 * зомби-состояние, которое невозможно отладить.
 */
export const alertMutes = sqliteTable('alert_mutes', {
  alertKey: text('alert_key').primaryKey(),
  mutedUntil: day('muted_until').notNull(),
  mutedAt: ts('muted_at').notNull(),
});

/**
 * Настройки с областью действия: 0 — общие для приложения (режим показа
 * экрана, активная команда), иначе идентификатор команды.
 */
export const settings = sqliteTable(
  'settings',
  {
    teamId: integer('team_id').notNull().default(0),
    key: text('key').notNull(),
    value: text('value').notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.teamId, t.key] })],
);
