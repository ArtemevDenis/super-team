import { addDays, daysBetween, type DayType } from './dates.js';

/** Категории редактируются в настройках, поэтому здесь просто строка. */
export type KarmaCategoryType = string;

export type KarmaEntryInputType = {
  category: KarmaCategoryType;
  happenedAt: DayType;
};


/** Окно, за которое карма показывается по умолчанию. */
export const KARMA_WINDOW_DAYS = 90;

/** Полураспад для оси Will — там карма должна затухать, а не копиться вечно. */
const HALF_LIFE_DAYS = 60;

export type KarmaSummaryType = {
  /** Записей за окно (по умолчанию 90 дней) — основная цифра. */
  inWindow: number;
  /** Записей за всё время. */
  total: number;
  windowDays: number;
  byCategory: { category: KarmaCategoryType; count: number }[];
  lastAt: DayType | null;
  /** Дней с последней записи; null — записей не было вовсе. */
  daysSinceLast: number | null;
};

/**
 * Считать нужно и за окно, и за всё время.
 *
 * Только «всего» — метрика мёртвая: старожил всегда наверху просто потому,
 * что дольше работает, и цифра перестаёт что-либо значить. Только «за
 * 90 дней» — теряется масштаб человека. Нужны обе.
 */
export function summarizeKarma(
  entries: readonly KarmaEntryInputType[],
  today: DayType,
  windowDays: number = KARMA_WINDOW_DAYS,
): KarmaSummaryType {
  const windowStart = addDays(today, -windowDays);
  const inWindowEntries = entries.filter((e) => e.happenedAt >= windowStart);

  const counts = new Map<KarmaCategoryType, number>();
  for (const entry of inWindowEntries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  const lastAt = entries.reduce<DayType | null>(
    (latest, entry) =>
      latest === null || entry.happenedAt > latest ? entry.happenedAt : latest,
    null,
  );

  return {
    inWindow: inWindowEntries.length,
    total: entries.length,
    windowDays,
    byCategory: [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    lastAt,
    daysSinceLast: lastAt === null ? null : daysBetween(lastAt, today),
  };
}

/**
 * Насыщающий балл для оси Will: 0..1. Все записи весят одинаково — категория
 * говорит, что это было, а не сколько это стоит.
 *
 * Кривая насыщения намеренная: десятая запись почти ничего не добавляет,
 * потому что карма отвечает «да/нет, выходит ли за рамки», а не «кто
 * набрал больше». И нормализовать по максимуму команды нельзя: один герой
 * утопил бы всех остальных, и получился бы лидерборд.
 */
export function karmaWillScore(
  entries: readonly KarmaEntryInputType[],
  today: DayType,
): number {
  const decayed = entries.reduce((sum, entry) => {
    const age = daysBetween(entry.happenedAt, today);
    if (age < 0) return sum;
    return sum + 0.5 ** (age / HALF_LIFE_DAYS);
  }, 0);

  return 1 - Math.exp(-decayed / 2);
}
