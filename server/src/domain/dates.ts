/**
 * Календарные дни как строки 'YYYY-MM-DD'.
 *
 * Вся арифметика здесь идёт через Date.UTC над разобранными компонентами, а
 * не над локальными Date: иначе переход на летнее время даёт разницу в 23
 * или 25 часов, Math.round их сглаживает по-разному, и «просрочено на 14
 * дней» иногда оказывается 13. Алертам нужно доверять безусловно, поэтому
 * дни считаются как дни, а не как миллисекунды.
 */

export type DayType = string;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Локальный календарный день — тот, что человек видит на часах. */
export function toDay(date: Date): DayType {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today(): DayType {
  return toDay(new Date());
}

export function nowTs(): string {
  return new Date().toISOString();
}

export function isDay(value: unknown): value is DayType {
  return typeof value === 'string' && DAY_PATTERN.test(value);
}

function toUtcMs(dayValue: DayType): number {
  const [year, month, date] = dayValue.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

function fromUtcMs(ms: number): DayType {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(dayValue: DayType, amount: number): DayType {
  return fromUtcMs(toUtcMs(dayValue) + amount * DAY_MS);
}

/** Целое число календарных дней от `from` до `to`; отрицательное — в прошлое. */
export function daysBetween(from: DayType, to: DayType): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function daysSince(dayValue: DayType, reference: DayType = today()): number {
  return daysBetween(dayValue, reference);
}

/** Строки 'YYYY-MM-DD' сравнимы лексикографически — этим и пользуемся. */
export function isBefore(a: DayType, b: DayType): boolean {
  return a < b;
}

export function isAfter(a: DayType, b: DayType): boolean {
  return a > b;
}

export function minDay(a: DayType, b: DayType): DayType {
  return a <= b ? a : b;
}

export function maxDay(a: DayType, b: DayType): DayType {
  return a >= b ? a : b;
}

/** Включительно с обеих сторон. */
export function isWithin(dayValue: DayType, from: DayType, to: DayType): boolean {
  return dayValue >= from && dayValue <= to;
}

export function startOfMonth(dayValue: DayType): DayType {
  return `${dayValue.slice(0, 7)}-01`;
}

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function formatDayRu(dayValue: DayType): string {
  const [year, month, date] = dayValue.split('-').map(Number);
  const monthName = MONTHS_GENITIVE[(month ?? 1) - 1] ?? '';
  const currentYear = new Date().getFullYear();
  const yearSuffix = year === currentYear ? '' : ` ${year}`;
  return `${date} ${monthName}${yearSuffix}`;
}
