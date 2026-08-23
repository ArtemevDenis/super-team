const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today(): string {
  return toDay(new Date());
}

function toUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

export function addDays(day: string, amount: number): string {
  const d = new Date(toUtcMs(day) + amount * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const daysWord = (count: number) => plural(count, 'день', 'дня', 'дней');

export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const monthName = MONTHS_GENITIVE[(month ?? 1) - 1] ?? '';
  const suffix = year === new Date().getFullYear() ? '' : ` ${year}`;
  return `${date} ${monthName}${suffix}`;
}

/** «сегодня» / «вчера» / «через 3 дня» — то, как о датах думают, а не ISO. */
export function formatRelative(day: string): string {
  const diff = daysBetween(today(), day);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff > 0 && diff <= 14) return `через ${diff} ${daysWord(diff)}`;
  if (diff < 0 && diff >= -14) return `${-diff} ${daysWord(-diff)} назад`;
  return formatDay(day);
}
