import { describe, expect, it } from 'vitest';

import {
  checkinGoodness,
  teamClimate,
  toGoodness,
  type PersonClimateType,
} from './climate.js';

const checkin = (motivation: number, workloadPressure = 3, satisfaction = 3) => ({
  measuredAt: '2025-06-01',
  motivation,
  workloadPressure,
  satisfaction,
});

const person = (
  personId: number,
  latest: ReturnType<typeof checkin> | null,
  previous: ReturnType<typeof checkin> | null = null,
): PersonClimateType => ({ personId, latest, previous });

describe('нормализация климата', () => {
  it('у мотивации и удовлетворённости больше значит лучше', () => {
    expect(toGoodness('motivation', 1)).toBe(0);
    expect(toGoodness('motivation', 5)).toBe(1);
    expect(toGoodness('satisfaction', 3)).toBe(0.5);
  });

  it('у нагрузки знак обратный: 5 — это перегружен, то есть плохо', () => {
    expect(toGoodness('workloadPressure', 5)).toBe(0);
    expect(toGoodness('workloadPressure', 1)).toBe(1);
  });

  it('человек с высокой мотивацией и перегрузкой не выглядит благополучным', () => {

    const burning = checkinGoodness({
      measuredAt: '2025-06-01',
      motivation: 5,
      workloadPressure: 5,
      satisfaction: 3,
    });
    const balanced = checkinGoodness({
      measuredAt: '2025-06-01',
      motivation: 4,
      workloadPressure: 2,
      satisfaction: 4,
    });
    expect(balanced).toBeGreaterThan(burning);
  });
});

describe('срез климата по команде', () => {
  it('берёт по одному последнему замеру на человека', () => {
    // Иначе тот, с кем встречаешься втрое чаще, влияет на среднее втрое
    // сильнее, и «средняя мотивация команды» зависит от твоего расписания.
    const team = teamClimate([
      person(1, checkin(5), checkin(1)),
      person(2, checkin(3), checkin(1)),
    ]);
    expect(team.axes[0]?.average).toBe(4);
  });

  it('не считает людей без единого замера', () => {
    const team = teamClimate([person(1, checkin(4)), person(2, null)]);
    expect(team.measuredPeople).toBe(1);
    expect(team.totalPeople).toBe(2);
    expect(team.axes[0]?.average).toBe(4);
  });

  it('на команде без замеров даёт null, а не ноль', () => {
    const team = teamClimate([person(1, null)]);
    expect(team.axes[0]?.average).toBeNull();
    expect(team.axes[0]?.worstValue).toBeNull();
  });

  it('показывает распределение — среднее его скрывает', () => {
    // Ровная команда и расколотая дают одинаковое среднее, но вторая
    // в кризисе. Различить их можно только по распределению.
    const flat = teamClimate([person(1, checkin(3)), person(2, checkin(3))]);
    const split = teamClimate([person(1, checkin(5)), person(2, checkin(1))]);

    expect(flat.axes[0]?.average).toBe(split.axes[0]?.average);
    expect(flat.axes[0]?.distribution).toEqual([0, 0, 2, 0, 0]);
    expect(split.axes[0]?.distribution).toEqual([1, 0, 0, 0, 1]);
  });

  it('у нагрузки худшее — наверху шкалы, а не внизу', () => {
    const team = teamClimate([
      person(1, checkin(3, 5)),
      person(2, checkin(3, 2)),
    ]);
    const motivation = team.axes.find((a) => a.key === 'motivation');
    const workload = team.axes.find((a) => a.key === 'workloadPressure');

    expect(workload?.worstValue).toBe(5);
    expect(workload?.higherIsBetter).toBe(false);
    expect(motivation?.higherIsBetter).toBe(true);
  });

  it('считает сдвиг относительно предыдущих замеров', () => {
    const team = teamClimate([
      person(1, checkin(4), checkin(2)),
      person(2, checkin(4), checkin(2)),
    ]);
    expect(team.axes[0]?.average).toBe(4);
    expect(team.axes[0]?.previousAverage).toBe(2);
  });
});
