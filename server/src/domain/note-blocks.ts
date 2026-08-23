import { noteBlockKinds } from '../db/schema.js';
import { daysBetween, type DayType } from './dates.js';

export type NoteBlockKindType = (typeof noteBlockKinds)[number];

export const FLIGHT_RISK_LEVELS = ['низкий', 'средний', 'высокий'] as const;
export type FlightRiskType = (typeof FLIGHT_RISK_LEVELS)[number];

export type NoteBlockSpecType = {
  kind: NoteBlockKindType;
  title: string;
  /** Что именно сюда писать — иначе блок заполняется общими словами. */
  placeholder: string;
  /**
   * Через сколько дней содержимое считается протухшим. У каждого блока
   * свой срок: карьерная цель живёт полгода, риск ухода — квартал.
   */
  reviewAfterDays: number;
  /** Значение-перечисление вместо текста; кормит алерты. */
  options?: readonly string[];
  /** Прячется в режиме шара экрана. */
  isSensitiveByDefault: boolean;
};

/**
 * Пять блоков, а не свободный текст.
 *
 * Свободная заметка не поддерживается в актуальном состоянии: через четыре
 * месяца это устаревший текст, которому сам не веришь. Структура плюс дата
 * пересмотра превращают заметку из архива в то, что можно перечитать перед
 * встречей и обновить за минуту.
 */
export const NOTE_BLOCK_SPECS: readonly NoteBlockSpecType[] = [
  {
    kind: 'career_goal',
    title: 'Куда он хочет',
    placeholder: 'Кем видит себя через год, что для этого нужно',
    reviewAfterDays: 180,
    isSensitiveByDefault: false,
  },
  {
    kind: 'motivators',
    title: 'Что драйвит',
    placeholder: 'От чего загорается: сложные задачи, автономия, влияние, люди',
    reviewAfterDays: 180,
    isSensitiveByDefault: false,
  },
  {
    kind: 'demotivators',
    title: 'Что демотивирует',
    placeholder: 'От чего гаснет: рутина, переключения, непонятные приоритеты',
    reviewAfterDays: 180,
    isSensitiveByDefault: true,
  },
  {
    kind: 'flight_risk',
    title: 'Риск ухода',
    placeholder: 'Почему именно такая оценка',
    reviewAfterDays: 90,
    options: FLIGHT_RISK_LEVELS,
    isSensitiveByDefault: true,
  },
  {
    kind: 'i_owe_long_term',
    title: 'Что я ему должен',
    placeholder: 'Долгие обещания без даты: тимлидство, конференция, смена команды',
    reviewAfterDays: 90,
    isSensitiveByDefault: false,
  },
];

export function specFor(kind: NoteBlockKindType): NoteBlockSpecType | undefined {
  return NOTE_BLOCK_SPECS.find((spec) => spec.kind === kind);
}

export type NoteBlockStalenessType = {
  isDue: boolean;
  daysOverdue: number;
  /** Дней с последнего подтверждения или правки; null — блок пуст. */
  ageDays: number | null;
};

/**
 * Свежесть блока считается от подтверждения, а не от правки: переподтвердить
 * «да, всё ещё так» — полноценное событие. Без этого блок, который ты
 * перечитал и признал верным, всё равно висел бы просроченным.
 */
export function noteBlockStaleness(
  block: { confirmedAt: DayType | null; reviewAt: DayType | null } | null,
  today: DayType,
): NoteBlockStalenessType {
  if (!block) return { isDue: false, daysOverdue: 0, ageDays: null };

  const ageDays = block.confirmedAt ? daysBetween(block.confirmedAt, today) : null;
  if (!block.reviewAt) return { isDue: false, daysOverdue: 0, ageDays };

  const daysOverdue = daysBetween(block.reviewAt, today);
  return { isDue: daysOverdue >= 0, daysOverdue: Math.max(0, daysOverdue), ageDays };
}
