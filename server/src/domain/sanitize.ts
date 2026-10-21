import type { AlertTypeKeyType } from './alerts.js';

/**
 * Режим шара экрана: вырезание чувствительного до сериализации.
 *
 * Прятать на клиенте бесполезно — данные всё равно уедут в сетевой ответ,
 * в кэш и в React DevTools, а однажды экран будет расшарен с открытой
 * консолью. Единственная безопасная версия — та, где сервер их просто
 * не отдаёт.
 *
 * Косяки здесь намеренно НЕ прячутся. Прячется то, о чём человек не знает:
 * твоя оценка риска его ухода, его демотиваторы, замеры настроя, напряжения
 * между людьми. Косяк — факт о событии, которое он и сам помнит, и в этом
 * он ближе к карме, чем к догадкам о человеке.
 *
 * Плата за это решение известна: режим включают, когда экран видит комната,
 * а «сорвал срок и не предупредил» на общем экране — публичный выговор.
 * Решение принято сознательно в пользу честности показа.
 *
 * Главная ловушка здесь не в источниках, а в производных. Вырезать блок
 * «риск ухода» и оставить алерт с заголовком «Высокий риск ухода» — значит
 * не спрятать ничего. Поэтому ниже перечислены и те, и другие.
 */

/** Алерты, которые пересказывают чувствительное прямо в заголовке. */
export const SENSITIVE_ALERT_TYPES: readonly AlertTypeKeyType[] = [
  'flight_risk_high',
  'climate_drop',
  'climate_low_sustained',
  'burnout_risk',
];

/** Блоки заметок, которые не показываются никогда, даже без пометки. */
export const SENSITIVE_NOTE_KINDS = ['flight_risk', 'demotivators'] as const;

const REDACTED = null;

const DROP = Symbol('drop');

type UnknownRecordType = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecordType {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const has = (node: UnknownRecordType, key: string) => key in node;

/** Опознание по форме: у приложения нет общего поля типа, а вводить его
 *  только ради этого — дороже, чем пять предикатов. */
const looksLikeNoteBlock = (node: UnknownRecordType) =>
  has(node, 'kind') && has(node, 'reviewAt');

const looksLikeRelation = (node: UnknownRecordType) =>
  has(node, 'fromPersonId') && has(node, 'toPersonId');

const looksLikeAlert = (node: UnknownRecordType) =>
  has(node, 'severity') && has(node, 'type') && has(node, 'personId');

const looksLikeMeeting = (node: UnknownRecordType) =>
  has(node, 'happenedAt') && has(node, 'status') && has(node, 'personId');

const looksLikeCheckin = (node: UnknownRecordType) =>
  has(node, 'workloadPressure') && has(node, 'motivation');

const looksLikeAgendaItem = (node: UnknownRecordType) =>
  has(node, 'text') && has(node, 'isSensitive');

const looksLikeTodo = (node: UnknownRecordType) =>
  has(node, 'userId') && has(node, 'position') && has(node, 'completedAt');

/** Целиком убрать из выдачи. */
function shouldDrop(node: UnknownRecordType): boolean {
  if (looksLikeNoteBlock(node)) {
    return (
      node.isSensitive === true ||
      SENSITIVE_NOTE_KINDS.includes(node.kind as (typeof SENSITIVE_NOTE_KINDS)[number])
    );
  }

  if (looksLikeRelation(node)) {
    return node.kind === 'tension' || node.isSensitive === true;
  }

  if (looksLikeAlert(node)) {
    return SENSITIVE_ALERT_TYPES.includes(node.type as AlertTypeKeyType);
  }

  // Настрой человека — приватная оценка лида. Строка «мотивация 2» рядом
  // с именем на общем экране бьёт сильнее, чем любая заметка.
  if (looksLikeCheckin(node)) return true;

  if (looksLikeAgendaItem(node)) return node.isSensitive === true;

  // Личные дела лида уходят целиком: виджет висит поверх всех окон и
  // попадает в любой показ экрана, а «поговорить с Петей про оффер» —
  // ровно то, что нельзя увидеть комнате.
  if (looksLikeTodo(node)) return true;

  // Средние по климату — тот же приватный настрой, только в агрегате.
  // Оставить их, вырезав сами замеры, значит спрятать частное и показать
  // общее: «средняя мотивация команды 2.4» на общем экране бьёт не слабее.
  if (has(node, 'axes') && has(node, 'measuredPeople')) return true;

  // Описание блока прячется вместе с содержимым. Пустой слот «Риск ухода»
  // не только выдаёт, что риск отслеживается, но и приглашает записать в
  // него текст поверх скрытого — то есть режим защиты стирал бы данные.
  if (has(node, 'isSensitiveByDefault')) return node.isSensitiveByDefault === true;

  return false;
}

const looksLikePersonCard = (node: UnknownRecordType) =>
  has(node, 'ovr') && has(node, 'tier') && has(node, 'core');

const looksLikeAbsence = (node: UnknownRecordType) =>
  has(node, 'fromDay') && has(node, 'toDay') && has(node, 'kind');

/** Оставить запись, но убрать из неё текст. */
function redactFields(node: UnknownRecordType): UnknownRecordType | null {
  /**
   * Оценка одного человека, показанная другому, — самое неприятное, что
   * может уехать с этого экрана. Прятать матрицу Skill × Will и оставлять
   * баллы, из которых она считается, бессмысленно: это та же утечка на шаг
   * назад. Личность и грейд остаются — они и так известны всем.
   */
  if (looksLikePersonCard(node)) {
    const ovr = node.ovr as { total?: number } | null;
    return {
      ...node,
      assessmentsHidden: true,
      ovr: { value: null, assessed: 0, total: ovr?.total ?? 0 },
      core: [],
      skills: [],
      pastExperience: [],
      gradeMatch: null,
      nextGrade: null,
      currentGaps: [],
    };
  }

  // Встречу саму по себе прятать нельзя: без неё каденция на экране
  // выглядит сломанной. Секрет — содержание, а не факт разговора.
  if (looksLikeMeeting(node) && node.isSensitive === true) {
    return { ...node, notes: REDACTED, agenda: REDACTED };
  }

  // Отсутствие остаётся видимым — это рабочая логистика, и календарь без
  // него бесполезен. Но «больничный» это медицинская информация, поэтому
  // вид обобщается: факт отсутствия не секрет, его причина — секрет.
  if (looksLikeAbsence(node)) {
    return { ...node, kind: 'отсутствие', note: REDACTED };
  }

  return null;
}

function walk(value: unknown): unknown | typeof DROP {
  if (Array.isArray(value)) {
    return value.map(walk).filter((item) => item !== DROP);
  }

  if (!isRecord(value)) return value;

  if (shouldDrop(value)) return DROP;

  const redacted = redactFields(value);
  const source = redacted ?? value;

  const result: UnknownRecordType = {};
  for (const [key, child] of Object.entries(source)) {
    const next = walk(child);
    if (next !== DROP) result[key] = next;
  }
  return result;
}

/**
 * Единственная точка вырезания. Применяется ко всему ответу целиком,
 * а не по роутам: любой новый метод попадает под правила автоматически,
 * и невозможно забыть добавить проверку в свежий обработчик.
 */
export function sanitizeForPresentation<T>(payload: T): T {
  const result = walk(payload);
  return (result === DROP ? null : result) as T;
}
