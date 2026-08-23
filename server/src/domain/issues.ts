import { daysBetween, type DayType } from './dates.js';

export type IssueInputType = {
  id: number;
  description: string;
  happenedAt: DayType;
  discussedAt: DayType | null;
};

/** Окно свежести — то же, что у кармы: хорошее и дурное выцветают одинаково. */
export const ISSUE_WINDOW_DAYS = 90;

/**
 * Сколько дней косяк может висеть непроговорённым, прежде чем это станет
 * сигналом. Две недели — примерно один цикл встреч: значит его уже успели
 * пропустить, а не «просто ещё не дошли руки».
 */
export const ISSUE_NAG_DAYS = 14;

export type IssueViewType = IssueInputType & {
  /** Дней с момента события. */
  ageDays: number;
  /** Проговорён ли. */
  isDiscussed: boolean;
  /** Висит непроговорённым дольше положенного. */
  isOverdue: boolean;
};

export type IssueSummaryType = {
  /** Непроговорённые — показываются всегда, независимо от давности. */
  open: IssueViewType[];
  /** Проговорённые за окно свежести. */
  recent: IssueViewType[];
  /** Сколько проговорённых осталось за окном — только счётчик. */
  olderCount: number;
  /** Всего за всё время: масштаб без перечисления. */
  total: number;
};

const toView = (issue: IssueInputType, today: DayType): IssueViewType => {
  const ageDays = daysBetween(issue.happenedAt, today);
  const isDiscussed = issue.discussedAt !== null;
  return {
    ...issue,
    ageDays,
    isDiscussed,
    isOverdue: !isDiscussed && ageDays >= ISSUE_NAG_DAYS,
  };
};

/**
 * Разбор записей на то, что показывать.
 *
 * Асимметрия здесь намеренная и она — главное решение всего раздела.
 * Непроговорённые не выцветают никогда: косяк, о котором не поговорили,
 * не становится менее важным от того, что он старый — наоборот. А вот
 * проговорённые уходят за окно: разговор состоялся, вопрос закрыт, и
 * держать его перед глазами вечно значит превращать инструмент в досье.
 *
 * История при этом не теряется — она остаётся в базе и доступна целиком,
 * просто не лезет на экран по умолчанию.
 */
export function summarizeIssues(
  issues: readonly IssueInputType[],
  today: DayType,
  windowDays = ISSUE_WINDOW_DAYS,
): IssueSummaryType {
  const views = issues.map((issue) => toView(issue, today));

  const open = views
    .filter((v) => !v.isDiscussed)
    .sort((a, b) => b.ageDays - a.ageDays);

  const discussed = views.filter((v) => v.isDiscussed);
  const recent = discussed
    .filter((v) => v.ageDays <= windowDays)
    .sort((a, b) => a.ageDays - b.ageDays);

  return {
    open,
    recent,
    olderCount: discussed.length - recent.length,
    total: views.length,
  };
}

/**
 * Сигнал только один и он про поведение лида, а не про человека.
 *
 * Формулировка «ты записал и не поговорил» намеренная: накопить молча и
 * предъявить всё разом на ревью — худший из возможных сценариев, и именно
 * от него сигнал защищает. Обратное — «у него три косяка» — сделало бы из
 * ленты счётчик провинностей.
 */
export function undiscussedIssueCount(
  issues: readonly IssueInputType[],
  today: DayType,
  nagDays = ISSUE_NAG_DAYS,
): number {
  return issues.filter(
    (issue) =>
      issue.discussedAt === null && daysBetween(issue.happenedAt, today) >= nagDays,
  ).length;
}
