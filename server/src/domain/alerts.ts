import type { CadenceStateType } from './cadence.js';
import type { ClimateCheckinType } from './climate.js';
import { daysBetween, type DayType } from './dates.js';

export type AlertSeverityType = 'critical' | 'warning' | 'info' | 'positive';

export const ALERT_TYPES = [
  'first_one_on_one_missing',
  'one_on_one_overdue',
  'one_on_ones_skipped_streak',
  'commitment_overdue_mine',
  'commitment_overdue_theirs',
  'commitment_due_soon',
  'climate_drop',
  'climate_low_sustained',
  'burnout_risk',
  'flight_risk_high',
  'probation_ending',
  'goal_stalled',
  'note_review_due',
  'karma_drought',
  'issue_undiscussed',
  'birthday_soon',
] as const;

export type AlertTypeKeyType = (typeof ALERT_TYPES)[number];

/**
 * Включено с первого дня — намеренно немного. Остальное опционально
 * в настройках: длинный список сигналов на старте гарантированно
 * превращается в шум раньше, чем успеваешь понять, какие из них полезны.
 */
export const DEFAULT_ENABLED_ALERTS: readonly AlertTypeKeyType[] = [
  'first_one_on_one_missing',
  'one_on_one_overdue',
  'commitment_overdue_mine',
  'commitment_overdue_theirs',
  'climate_drop',
  'climate_low_sustained',
  'flight_risk_high',
  'issue_undiscussed',
  'birthday_soon',
];

export type AlertType = {
  /** Стабильный ключ — по нему живёт заглушка в alert_mutes. */
  key: string;
  type: AlertTypeKeyType;
  severity: AlertSeverityType;
  personId: number;
  title: string;
  detail: string | null;
};

export type AlertCommitmentType = {
  id: number;
  direction: 'i_owe' | 'they_owe';
  title: string;
  dueAt: DayType | null;
  status: 'open' | 'done' | 'cancelled' | 'snoozed';
  snoozedUntil: DayType | null;
};

export type AlertPersonInputType = {
  id: number;
  fullName: string;
  /** Смежникам не ставят оценки и карму — часть правил к ним неприменима. */
  kind: 'member' | 'peer';
  cadenceDays: number;
  hiredAt: DayType | null;
  probationEndsAt: DayType | null;
  birthday: DayType | null;
  cadence: CadenceStateType;
  /** Последние чекины, новые первыми. */
  checkins: readonly ClimateCheckinType[];
  commitments: readonly AlertCommitmentType[];
  /** Подряд идущие пропуски запланированных встреч. */
  skippedStreak: number;
  flightRisk: string | null;
  lastKarmaAt: DayType | null;
  /** Записанные косяки, о которых ещё не поговорили дольше положенного. */
  undiscussedIssues: number;
  noteReviewDue: number;
  stalledGoals: number;
};

export type AlertEngineOptionsType = {
  today: DayType;
  enabled?: readonly AlertTypeKeyType[];
  /** alertKey → день, до которого скрыт. */
  mutes?: Readonly<Record<string, DayType>>;
};

export type PersonAlertGroupType = {
  personId: number;
  personName: string;
  worstSeverity: AlertSeverityType;
  alerts: AlertType[];
};

const SEVERITY_RANK: Record<AlertSeverityType, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
};

/**
 * Сколько карточек людей показываем на дашборде. Список из тридцати красных
 * пунктов — это список из нуля пунктов: его перестают читать целиком.
 */
export const DASHBOARD_GROUP_LIMIT = 7;

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function daysWord(count: number): string {
  return plural(count, 'день', 'дня', 'дней');
}

/** Дней до ближайшего дня рождения без учёта года. */
function daysToAnniversary(birthday: DayType, todayValue: DayType): number {
  const [, month, date] = birthday.split('-');
  const year = Number(todayValue.slice(0, 4));
  const thisYear = `${year}-${month}-${date}`;
  const diff = daysBetween(todayValue, thisYear);
  if (diff >= 0) return diff;
  return daysBetween(todayValue, `${year + 1}-${month}-${date}`);
}

function isOverdue(commitment: AlertCommitmentType, todayValue: DayType): boolean {
  if (commitment.status !== 'open') return false;
  if (!commitment.dueAt) return false;
  if (commitment.snoozedUntil && commitment.snoozedUntil > todayValue) return false;
  return commitment.dueAt < todayValue;
}

/**
 * Правила для одного человека. Каждая категория даёт максимум один алерт:
 * шесть отдельных строк про устаревшие оценки читаются как шум, одна
 * агрегированная — как задача.
 */
function alertsForPerson(
  person: AlertPersonInputType,
  todayValue: DayType,
): AlertType[] {
  const found: AlertType[] = [];
  const at = (type: AlertTypeKeyType, severity: AlertSeverityType, title: string, detail: string | null = null) => {
    found.push({
      key: `${type}:person:${person.id}`,
      type,
      severity,
      personId: person.id,
      title,
      detail,
    });
  };

  const { cadence } = person;

  // Отсутствующего человека не трогаем вообще: любой алерт про него сейчас
  // заведомо ложный, а ложные алерты обесценивают всю ленту.
  if (cadence.isAbsentToday) return found;

  if (cadence.neverMet && (cadence.tenureDays ?? 0) > 7) {
    at(
      'first_one_on_one_missing',
      'critical',
      'Ни одного 1-1 с новичком',
      `В команде уже ${cadence.tenureDays} ${daysWord(cadence.tenureDays ?? 0)}`,
    );
  } else if (cadence.isOverdue) {
    const ratio =
      (cadence.effectiveDaysSinceLast ?? 0) / Math.max(1, person.cadenceDays);
    const severity: AlertSeverityType =
      ratio > 1.75 || person.flightRisk === 'средний' || person.flightRisk === 'высокий'
        ? 'critical'
        : 'warning';
    at(
      'one_on_one_overdue',
      severity,
      `1-1 просрочен на ${cadence.overdueDays} ${daysWord(cadence.overdueDays)}`,
      cadence.lastDoneAt
        ? `Последняя встреча ${cadence.daysSinceLast} ${daysWord(cadence.daysSinceLast ?? 0)} назад`
        : null,
    );
  }

  if (person.skippedStreak >= 2) {
    at(
      'one_on_ones_skipped_streak',
      'warning',
      `${person.skippedStreak} встречи подряд пропущены`,
      'Пропуск — это тоже сигнал, а не просто отсутствие данных',
    );
  }

  const overdueMine = person.commitments.filter(
    (c) => c.direction === 'i_owe' && isOverdue(c, todayValue),
  );
  const overdueTheirs = person.commitments.filter(
    (c) => c.direction === 'they_owe' && isOverdue(c, todayValue),
  );
  const dueSoon = person.commitments.filter(
    (c) =>
      c.status === 'open' &&
      c.dueAt !== null &&
      c.dueAt >= todayValue &&
      daysBetween(todayValue, c.dueAt) <= 2,
  );

  // Сломанное обещание лида всегда critical: доверие ломается именно здесь,
  // а не на неидеальных оценках.
  if (overdueMine.length > 0) {
    at(
      'commitment_overdue_mine',
      'critical',
      overdueMine.length === 1
        ? 'Ты не сделал обещанное'
        : `Ты не сделал ${overdueMine.length} обещанных вещи`,
      overdueMine.map((c) => c.title).join(' · '),
    );
  }
  if (overdueTheirs.length > 0) {
    at(
      'commitment_overdue_theirs',
      'warning',
      overdueTheirs.length === 1
        ? 'Просрочено его обещание'
        : `Просрочено обещаний: ${overdueTheirs.length}`,
      overdueTheirs.map((c) => c.title).join(' · '),
    );
  }
  if (dueSoon.length > 0) {
    at(
      'commitment_due_soon',
      'info',
      `Срок на днях: ${dueSoon.length}`,
      dueSoon.map((c) => c.title).join(' · '),
    );
  }

  const [latest, prev1, prev2] = person.checkins;
  if (latest && prev1) {
    const baseline = prev2
      ? { motivation: (prev1.motivation + prev2.motivation) / 2, satisfaction: (prev1.satisfaction + prev2.satisfaction) / 2 }
      : { motivation: prev1.motivation, satisfaction: prev1.satisfaction };

    const motivationDrop = baseline.motivation - latest.motivation;
    const satisfactionDrop = baseline.satisfaction - latest.satisfaction;
    if (motivationDrop >= 2 || satisfactionDrop >= 2) {
      at(
        'climate_drop',
        'critical',
        'Резкое падение настроя',
        motivationDrop >= satisfactionDrop
          ? `Мотивация ${prev1.motivation} → ${latest.motivation}`
          : `Удовлетворённость ${prev1.satisfaction} → ${latest.satisfaction}`,
      );
    }
  }

  if (latest && prev1) {
    const bothLowMotivation = latest.motivation <= 2 && prev1.motivation <= 2;
    const bothOverloaded =
      latest.workloadPressure >= 4 && prev1.workloadPressure >= 4;
    if (bothLowMotivation || bothOverloaded) {
      at(
        'climate_low_sustained',
        'critical',
        bothLowMotivation ? 'Мотивация низкая два замера подряд' : 'Перегружен два замера подряд',
        'Это уже не разовый плохой день',
      );
    }
  }

  if (person.flightRisk === 'высокий' && (cadence.daysSinceLast ?? 999) > 14) {
    at(
      'flight_risk_high',
      'critical',
      'Высокий риск ухода, а встречи не было две недели',
      null,
    );
  }

  if (person.probationEndsAt) {
    const left = daysBetween(todayValue, person.probationEndsAt);
    if (left >= 0 && left <= 14) {
      at(
        'probation_ending',
        'warning',
        left === 0 ? 'Испытательный заканчивается сегодня' : `Испытательный кончается через ${left} ${daysWord(left)}`,
        null,
      );
    }
  }

  if (person.stalledGoals > 0) {
    at('goal_stalled', 'warning', `Цель буксует: ${person.stalledGoals}`, null);
  }

  if (person.noteReviewDue > 0) {
    at(
      'note_review_due',
      'info',
      `Пора пересмотреть заметки: ${person.noteReviewDue}`,
      'Цель или мотиваторы могли устареть',
    );
  }

  // Формулировка намеренно про поведение лида, а не про человека: это самый
  // высокий сигнал/шум в списке, и звучать он должен как напоминание себе.
  const tenure = cadence.tenureDays ?? 0;
  const karmaAge = person.lastKarmaAt ? daysBetween(person.lastKarmaAt, todayValue) : null;
  // Смежникам карму не ставят, поэтому «давно не отмечал» для них — не
  // сигнал, а шум: отмечать было и не нужно.
  if (person.kind === 'member' && tenure > 90 && (karmaAge === null || karmaAge > 90)) {
    at(
      'karma_drought',
      'info',
      'Ты давно не отмечал ничего хорошего',
      karmaAge === null ? 'Ни одной записи в карме' : `Последняя запись ${karmaAge} ${daysWord(karmaAge)} назад`,
    );
  }

  /**
   * Сигнал про записанный, но непроговорённый косяк.
   *
   * Формулировка про лида, а не про человека: «ты записал и не поговорил».
   * Обратная — «у него три косяка» — превратила бы ленту в счётчик
   * провинностей, а весь смысл раздела в том, чтобы разговор состоялся.
   * Накопить молча и предъявить всё разом на ревью — худший из сценариев,
   * и защищает от него именно этот сигнал.
   */
  if (person.undiscussedIssues > 0) {
    at(
      'issue_undiscussed',
      'warning',
      person.undiscussedIssues === 1
        ? 'Записан косяк, но разговора не было'
        : `Записано косяков без разговора: ${person.undiscussedIssues}`,
      'Чем дольше молчишь, тем тяжелее будет разговор',
    );
  }

  // В ленте обязана быть хорошая новость — сплошь красный дашборд закрывают.
  if (person.birthday) {
    const left = daysToAnniversary(person.birthday, todayValue);
    if (left <= 7) {
      at(
        'birthday_soon',
        'positive',
        left === 0 ? 'День рождения сегодня' : `День рождения через ${left} ${daysWord(left)}`,
        null,
      );
    }
  }

  return found;
}

export function computeAlerts(
  people: readonly AlertPersonInputType[],
  options: AlertEngineOptionsType,
): AlertType[] {
  const enabled = new Set(options.enabled ?? DEFAULT_ENABLED_ALERTS);
  const mutes = options.mutes ?? {};

  return people
    .flatMap((person) => alertsForPerson(person, options.today))
    .filter((alert) => enabled.has(alert.type))
    .filter((alert) => {
      const mutedUntil = mutes[alert.key];
      return !mutedUntil || mutedUntil <= options.today;
    });
}

/**
 * Группировка по людям, а не по типам — главное решение всего движка.
 * Лид думает «с кем мне сегодня разобраться», а не «какие бывают типы
 * алертов», и дашборд должен отвечать ровно на этот вопрос.
 */
export function groupByPerson(
  alerts: readonly AlertType[],
  names: Readonly<Record<number, string>>,
): PersonAlertGroupType[] {
  const groups = new Map<number, PersonAlertGroupType>();

  for (const alert of alerts) {
    let group = groups.get(alert.personId);
    if (!group) {
      group = {
        personId: alert.personId,
        personName: names[alert.personId] ?? 'Без имени',
        worstSeverity: alert.severity,
        alerts: [],
      };
      groups.set(alert.personId, group);
    }
    group.alerts.push(alert);
    if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[group.worstSeverity]) {
      group.worstSeverity = alert.severity;
    }
  }

  for (const group of groups.values()) {
    group.alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }

  return [...groups.values()].sort((a, b) => {
    const bySeverity =
      SEVERITY_RANK[a.worstSeverity] - SEVERITY_RANK[b.worstSeverity];
    if (bySeverity !== 0) return bySeverity;
    return b.alerts.length - a.alerts.length;
  });
}
