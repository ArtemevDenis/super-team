import { describe, expect, it } from 'vitest';

import {
  ISSUE_NAG_DAYS,
  summarizeIssues,
  undiscussedIssueCount,
  type IssueInputType,
} from './issues.js';

const TODAY = '2026-08-24';

const issue = (
  id: number,
  happenedAt: string,
  discussedAt: string | null = null,
): IssueInputType => ({ id, description: `к${id}`, happenedAt, discussedAt });

describe('косяки', () => {
  it('пустой список не ломается', () => {
    const s = summarizeIssues([], TODAY);
    expect(s.open).toEqual([]);
    expect(s.recent).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.olderCount).toBe(0);
  });

  /**
   * Главное правило раздела: разговор гасит запись, время — нет.
   */
  it('непроговорённый не выцветает даже через год', () => {
    const s = summarizeIssues([issue(1, '2025-08-24')], TODAY);
    expect(s.open).toHaveLength(1);
    expect(s.open[0]!.ageDays).toBe(365);
    expect(s.olderCount).toBe(0);
  });

  it('проговорённый уходит за окно, но остаётся в счётчике', () => {
    const s = summarizeIssues(
      [issue(1, '2025-08-24', '2025-08-25'), issue(2, '2026-08-01', '2026-08-02')],
      TODAY,
    );
    expect(s.open).toHaveLength(0);
    expect(s.recent.map((v) => v.id)).toEqual([2]);
    expect(s.olderCount).toBe(1);
    expect(s.total).toBe(2);
  });

  it('старые непроговорённые идут первыми — они и есть долг', () => {
    const s = summarizeIssues(
      [issue(1, '2026-08-20'), issue(2, '2026-06-01'), issue(3, '2026-08-10')],
      TODAY,
    );
    expect(s.open.map((v) => v.id)).toEqual([2, 3, 1]);
  });

  it('свежий непроговорённый ещё не долг', () => {
    const recent = summarizeIssues([issue(1, '2026-08-23')], TODAY);
    expect(recent.open[0]!.isOverdue).toBe(false);

    const stale = summarizeIssues([issue(2, '2026-08-01')], TODAY);
    expect(stale.open[0]!.isOverdue).toBe(true);
  });

  it('порог долга ровно на границе', () => {
    const atThreshold = summarizeIssues(
      [issue(1, '2026-08-10')], // ровно 14 дней
      TODAY,
    );
    expect(atThreshold.open[0]!.ageDays).toBe(ISSUE_NAG_DAYS);
    expect(atThreshold.open[0]!.isOverdue).toBe(true);
  });

  /**
   * Сигнал считает только непроговорённое: у проговорённого косяка нет
   * срока давности, потому что вопроса больше нет.
   */
  it('сигнал считает только непроговорённые и только просроченные', () => {
    const issues = [
      issue(1, '2026-06-01'), // старый, не обсуждён → считается
      issue(2, '2026-08-23'), // свежий, не обсуждён → нет
      issue(3, '2026-06-01', '2026-06-02'), // старый, обсуждён → нет
    ];
    expect(undiscussedIssueCount(issues, TODAY)).toBe(1);
  });

  it('обсуждение в тот же день закрывает вопрос', () => {
    const s = summarizeIssues([issue(1, '2026-08-24', '2026-08-24')], TODAY);
    expect(s.open).toHaveLength(0);
    expect(s.recent).toHaveLength(1);
    expect(undiscussedIssueCount([issue(1, '2026-08-24', '2026-08-24')], TODAY)).toBe(0);
  });
});
