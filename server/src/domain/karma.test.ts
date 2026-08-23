import { describe, expect, it } from 'vitest';

import { karmaWillScore, summarizeKarma, type KarmaEntryInputType } from './karma.js';

const TODAY = '2025-06-30';

const entry = (
  daysAgo: number,
  category = 'инициатива',
): KarmaEntryInputType => {
  const date = new Date(Date.UTC(2025, 5, 30) - daysAgo * 86_400_000);
  return { category, happenedAt: date.toISOString().slice(0, 10) };
};

const score = (entries: KarmaEntryInputType[]) => karmaWillScore(entries, TODAY);

describe('сводка по карме', () => {
  it('считает отдельно за окно и за всё время', () => {
    const summary = summarizeKarma(
      [entry(10), entry(40), entry(200), entry(300)],
      TODAY,
    );
    expect(summary.inWindow).toBe(2);
    expect(summary.total).toBe(4);
  });

  it('включает границу окна', () => {
    expect(summarizeKarma([entry(90)], TODAY).inWindow).toBe(1);
    expect(summarizeKarma([entry(91)], TODAY).inWindow).toBe(0);
  });

  it('разбивает по категориям и сортирует по частоте', () => {
    const summary = summarizeKarma(
      [
        entry(1, 'помощь коллеге'),
        entry(2, 'помощь коллеге'),
        entry(3, 'менторство'),
      ],
      TODAY,
    );
    expect(summary.byCategory[0]).toEqual({ category: 'помощь коллеге', count: 2 });
    expect(summary.byCategory[1]).toEqual({ category: 'менторство', count: 1 });
  });

  it('находит дату последней записи и возраст', () => {
    const summary = summarizeKarma([entry(30), entry(5), entry(90)], TODAY);
    expect(summary.daysSinceLast).toBe(5);
  });

  it('считает записи под удалённой категорией', () => {
    // Категорию могли переименовать или скрыть в настройках — история
    // под старым названием обязана остаться видимой.
    const summary = summarizeKarma([entry(5, 'старая категория')], TODAY);
    expect(summary.inWindow).toBe(1);
    expect(summary.byCategory[0]?.category).toBe('старая категория');
  });

  it('не падает на пустом списке', () => {
    const summary = summarizeKarma([], TODAY);
    expect(summary).toMatchObject({
      inWindow: 0,
      total: 0,
      lastAt: null,
      daysSinceLast: null,
    });
  });
});

describe('балл кармы для оси Will', () => {
  it('у человека без кармы равен нулю', () => {
    expect(score([])).toBe(0);
  });

  it('насыщается: десятая запись добавляет заметно меньше первой', () => {
    const growthAtStart = score([entry(1), entry(2)]) - score([entry(1)]);

    const many = Array.from({ length: 9 }, (_, i) => entry(i + 1));
    const growthLater = score([...many, entry(10)]) - score(many);

    expect(growthLater).toBeLessThan(growthAtStart / 3);
  });

  it('никогда не выходит за единицу, сколько бы записей ни было', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => entry(i % 30));
    // Кривая асимптотически упирается в 1 и во float достигает ровно 1 —
    // важно именно то, что за единицу она не выходит никогда.
    expect(score(hundred)).toBeLessThanOrEqual(1);
    expect(score(hundred)).toBeGreaterThan(0.9);
  });

  it('старая карма весит меньше свежей', () => {
    expect(score([entry(5)])).toBeGreaterThan(score([entry(180)]));
  });

  it('не различает категории: все записи весят одинаково', () => {
    expect(score([entry(5, 'улучшение процесса')])).toBe(
      score([entry(5, 'помощь коллеге')]),
    );
  });

  it('считает записи под категорией, которой больше нет в настройках', () => {
    expect(score([entry(5, 'удалённая')])).toBeGreaterThan(0);
  });
});
