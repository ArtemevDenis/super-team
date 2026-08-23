import { describe, expect, it } from 'vitest';

import { absentDaysInWindow, computeCadence } from './cadence.js';

const base = {
  today: '2025-06-30',
  cadenceDays: 14,
  hiredAt: '2024-01-15',
  absences: [],
} as const;

describe('окно отсутствий', () => {
  it('обрезает интервал по границам окна', () => {
    const absences = [{ fromDay: '2025-05-25', toDay: '2025-06-10' }];
    // Пересечение с [2025-06-01, 2025-06-30] — это 1..10 июня, 10 дней.
    expect(absentDaysInWindow(absences, '2025-06-01', '2025-06-30')).toBe(10);
  });

  it('не считает один и тот же день дважды при пересечении интервалов', () => {
    const absences = [
      { fromDay: '2025-06-02', toDay: '2025-06-08' },
      { fromDay: '2025-06-06', toDay: '2025-06-12' },
    ];
    // 2..12 июня — 11 дней, а не 7 + 7.
    expect(absentDaysInWindow(absences, '2025-06-01', '2025-06-30')).toBe(11);
  });

  it('склеивает смежные интервалы', () => {
    const absences = [
      { fromDay: '2025-06-02', toDay: '2025-06-05' },
      { fromDay: '2025-06-06', toDay: '2025-06-09' },
    ];
    expect(absentDaysInWindow(absences, '2025-06-01', '2025-06-30')).toBe(8);
  });
});

describe('каденция 1-1', () => {
  it('отмечает просрочку, когда прошло больше личной каденции', () => {
    const state = computeCadence({ ...base, lastDoneAt: '2025-06-01' });
    expect(state.daysSinceLast).toBe(29);
    expect(state.isOverdue).toBe(true);
    expect(state.overdueDays).toBe(15);
    expect(state.dueAt).toBe('2025-06-15');
  });

  it('молчит, пока каденция не вышла', () => {
    const state = computeCadence({ ...base, lastDoneAt: '2025-06-20' });
    expect(state.isOverdue).toBe(false);
    expect(state.overdueDays).toBe(0);
  });

  it('ставит каденцию на паузу на время отпуска', () => {
    // Календарно прошло 29 дней при каденции 14 — без паузы это просрочка.
    // Но 20 из них человек был в отпуске, значит просрочки нет.
    const state = computeCadence({
      ...base,
      lastDoneAt: '2025-06-01',
      absences: [{ fromDay: '2025-06-05', toDay: '2025-06-24' }],
    });
    expect(state.daysSinceLast).toBe(29);
    expect(state.effectiveDaysSinceLast).toBe(9);
    expect(state.isOverdue).toBe(false);
    // Срок сдвинулся вперёд ровно на 20 пропущенных дней.
    expect(state.dueAt).toBe('2025-07-05');
  });

  it('никогда не считает просроченным того, кто отсутствует прямо сейчас', () => {
    const state = computeCadence({
      ...base,
      lastDoneAt: '2025-01-01',
      absences: [{ fromDay: '2025-06-28', toDay: '2025-07-10' }],
    });
    expect(state.isAbsentToday).toBe(true);
    expect(state.isOverdue).toBe(false);
  });

  it('для новичка без встреч отсчитывает от даты найма', () => {
    const state = computeCadence({
      ...base,
      hiredAt: '2025-06-20',
      lastDoneAt: null,
    });
    expect(state.neverMet).toBe(true);
    expect(state.tenureDays).toBe(10);
    expect(state.daysSinceLast).toBeNull();
  });

  it('не падает, когда нет ни встреч, ни даты найма', () => {
    const state = computeCadence({ ...base, hiredAt: null, lastDoneAt: null });
    expect(state.dueAt).toBeNull();
    expect(state.isOverdue).toBe(false);
  });
});
