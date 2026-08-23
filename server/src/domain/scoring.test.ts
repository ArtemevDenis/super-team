import { describe, expect, it } from 'vitest';

import {
  cardTier,
  computeOvr,
  displayValue,
  gradeDelta,
  reliability,
  topGaps,
  type AssessedAttributeType,
} from './scoring.js';

const TODAY = '2025-06-30';

function attr(
  id: number,
  value: number | null,
  overrides: Partial<AssessedAttributeType> = {},
): AssessedAttributeType {
  return {
    attributeId: id,
    key: `attr_${id}`,
    name: `Атрибут ${id}`,
    shortCode: 'АТР',
    kind: 'core',
    axis: 'skill',
    value,
    confidence: value === null ? null : 'sure',
    assessedAt: value === null ? null : TODAY,
    ...overrides,
  };
}

describe('перевод шкалы', () => {
  it('растягивает 1..5 в 39..99 как на футбольной карточке', () => {
    expect(displayValue(1)).toBe(39);
    expect(displayValue(3)).toBe(69);
    expect(displayValue(5)).toBe(99);
  });
});

describe('OVR', () => {
  it('усредняет отображаемые значения core-атрибутов', () => {
    const ovr = computeOvr([attr(1, 3), attr(2, 3), attr(3, 3)]);
    expect(ovr.value).toBe(69);
  });

  it('возвращает null, если оценён не весь набор', () => {
    // Частичный OVR уверенно врёт, и по самому числу это не видно —
    // поэтому карточка должна показать «??», а не среднее по трём из шести.
    const ovr = computeOvr([attr(1, 5), attr(2, 5), attr(3, null)]);
    expect(ovr.value).toBeNull();
    expect(ovr.assessed).toBe(2);
    expect(ovr.total).toBe(3);
  });

  it('возвращает null на пустом наборе, а не ноль', () => {
    expect(computeOvr([]).value).toBeNull();
  });

  it('не зависит от давности и уверенности оценки', () => {
    // Если число падает само, лид перестаёт доверять всем числам приложения.
    const fresh = computeOvr([attr(1, 4), attr(2, 4)]);
    const stale = computeOvr([
      attr(1, 4, { assessedAt: '2020-01-01', confidence: 'assuming' }),
      attr(2, 4, { assessedAt: '2020-01-01', confidence: 'assuming' }),
    ]);
    expect(stale.value).toBe(fresh.value);
  });
});

describe('надёжность', () => {
  it('свежая уверенная оценка надёжна полностью', () => {
    expect(reliability(TODAY, 'sure', TODAY).score).toBe(1);
  });

  it('предположение весит меньше уверенного знания', () => {
    expect(reliability(TODAY, 'assuming', TODAY).score).toBeCloseTo(0.6);
  });

  it('падает с возрастом и обнуляется через год', () => {
    expect(reliability('2024-06-30', 'sure', TODAY).score).toBe(0);
    expect(reliability('2025-03-31', 'sure', TODAY).score).toBeGreaterThan(0);
  });

  it('поднимает флаг устаревания после полугода', () => {
    expect(reliability('2025-06-01', 'sure', TODAY).isStale).toBe(false);
    expect(reliability('2024-12-01', 'sure', TODAY).isStale).toBe(true);
  });

  it('не падает, когда оценки не было вовсе', () => {
    expect(reliability(null, null, TODAY)).toEqual({
      score: 0,
      ageDays: null,
      isStale: false,
    });
  });
});

describe('дельта от грейда', () => {
  const expectations = [
    { attributeId: 1, expectedValue: 4 },
    { attributeId: 2, expectedValue: 4 },
  ];

  it('не считает превышение ожидания разрывом', () => {
    // Иначе сильный в одном и слабый в другом выглядел бы ровно как
    // средний по обоим.
    const strong = gradeDelta([attr(1, 5), attr(2, 4)], expectations);
    const exact = gradeDelta([attr(1, 4), attr(2, 4)], expectations);

    expect(strong.match).toBe(1);
    expect(exact.match).toBe(1);
    expect(strong.gaps).toEqual([]);
  });

  it('считает долю недобора', () => {
    // Не хватает 2 из 8 ожидаемых пунктов → 75%.
    const delta = gradeDelta([attr(1, 2), attr(2, 4)], expectations);
    expect(delta.match).toBe(0.75);
  });

  it('игнорирует ожидания по неприменимым атрибутам', () => {
    // Ожидание по скиллу чужой специализации к человеку отношения не имеет.
    const delta = gradeDelta([attr(1, 4)], [
      ...expectations,
      { attributeId: 99, expectedValue: 5 },
    ]);
    expect(delta.gaps.some((g) => g.attributeId === 99)).toBe(false);
  });

  it('возвращает null, если что-то из ожидаемого не оценено', () => {
    const delta = gradeDelta([attr(1, 4), attr(2, null)], expectations);
    expect(delta.match).toBeNull();
    expect(delta.unassessed).toBe(1);
  });

  it('сортирует разрывы по величине и режет до трёх', () => {
    const delta = gradeDelta(
      [attr(1, 1), attr(2, 3), attr(3, 2), attr(4, 4)],
      [
        { attributeId: 1, expectedValue: 4 },
        { attributeId: 2, expectedValue: 4 },
        { attributeId: 3, expectedValue: 4 },
        { attributeId: 4, expectedValue: 4 },
      ],
    );
    expect(delta.gaps.map((g) => g.gap)).toEqual([3, 2, 1]);
    expect(topGaps(delta, 2).map((g) => g.gap)).toEqual([3, 2]);
  });

  it('на пустых ожиданиях даёт null, а не деление на ноль', () => {
    expect(gradeDelta([attr(1, 3)], []).match).toBeNull();
  });
});

describe('тир карточки', () => {
  it('зависит от грейда, а не от OVR', () => {
    // Senior с 70 и Junior с 70 — разные вещи.
    expect(cardTier(1)).toBe('bronze');
    expect(cardTier(2)).toBe('silver');
    expect(cardTier(3)).toBe('gold');
    expect(cardTier(4)).toBe('special');
    expect(cardTier(null)).toBe('bronze');
  });
});
