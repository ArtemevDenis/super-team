import { describe, expect, it } from 'vitest';

import {
  ALERT_TYPES,
  computeAlerts,
  groupByPerson,
  type AlertPersonInputType,
} from './alerts.js';
import { computeCadence } from './cadence.js';

const TODAY = '2025-06-30';
const ALL = ALERT_TYPES;

function person(
  overrides: Partial<AlertPersonInputType> & { id: number },
): AlertPersonInputType {
  return {
    fullName: `Человек ${overrides.id}`,
    kind: 'member' as const,
    cadenceDays: 14,
    hiredAt: '2024-01-15',
    probationEndsAt: null,
    birthday: null,
    cadence: computeCadence({
      today: TODAY,
      cadenceDays: 14,
      lastDoneAt: '2025-06-25',
      hiredAt: '2024-01-15',
      absences: [],
    }),
    checkins: [],
    commitments: [],
    skippedStreak: 0,
    flightRisk: null,
    lastKarmaAt: '2025-06-01',
    noteReviewDue: 0,
    stalledGoals: 0,
  undiscussedIssues: 0,
    ...overrides,
  };
}

const run = (people: AlertPersonInputType[], mutes = {}) =>
  computeAlerts(people, { today: TODAY, enabled: ALL, mutes });

describe('движок алертов', () => {
  it('полностью молчит про человека, который сейчас отсутствует', () => {
    const alerts = run([
      person({
        id: 1,
        flightRisk: 'высокий',
        stalledGoals: 3,
        cadence: computeCadence({
          today: TODAY,
          cadenceDays: 14,
          lastDoneAt: '2025-01-01',
          hiredAt: '2024-01-15',
          absences: [{ fromDay: '2025-06-20', toDay: '2025-07-10' }],
        }),
        commitments: [
          {
            id: 1,
            direction: 'i_owe',
            title: 'Поднять зарплату',
            dueAt: '2025-01-01',
            status: 'open',
            snoozedUntil: null,
          },
        ],
      }),
    ]);
    expect(alerts).toHaveLength(0);
  });

  it('всегда делает сломанное обещание лида критичным', () => {
    const alerts = run([
      person({
        id: 1,
        commitments: [
          {
            id: 1,
            direction: 'i_owe',
            title: 'Дать доступ к проду',
            dueAt: '2025-06-29',
            status: 'open',
            snoozedUntil: null,
          },
        ],
      }),
    ]);
    const mine = alerts.find((a) => a.type === 'commitment_overdue_mine');
    expect(mine?.severity).toBe('critical');
  });

  it('его просроченное обещание — только предупреждение', () => {
    const alerts = run([
      person({
        id: 1,
        commitments: [
          {
            id: 1,
            direction: 'they_owe',
            title: 'Дописать тесты',
            dueAt: '2025-06-20',
            status: 'open',
            snoozedUntil: null,
          },
        ],
      }),
    ]);
    expect(
      alerts.find((a) => a.type === 'commitment_overdue_theirs')?.severity,
    ).toBe('warning');
  });

  it('схлопывает несколько просроченных обещаний в один алерт', () => {
    const alerts = run([
      person({
        id: 1,
        commitments: [1, 2, 3].map((id) => ({
          id,
          direction: 'i_owe' as const,
          title: `Обещание ${id}`,
          dueAt: '2025-06-01',
          status: 'open' as const,
          snoozedUntil: null,
        })),
      }),
    ]);
    const mine = alerts.filter((a) => a.type === 'commitment_overdue_mine');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.title).toContain('3');
  });

  it('не считает просроченным отложенное обещание', () => {
    const alerts = run([
      person({
        id: 1,
        commitments: [
          {
            id: 1,
            direction: 'i_owe',
            title: 'Отложено',
            dueAt: '2025-06-01',
            status: 'open',
            snoozedUntil: '2025-07-15',
          },
        ],
      }),
    ]);
    expect(alerts.find((a) => a.type === 'commitment_overdue_mine')).toBeUndefined();
  });

  it('повышает просрочку 1-1 до критичной при высоком риске ухода', () => {
    const overdue = computeCadence({
      today: TODAY,
      cadenceDays: 14,
      lastDoneAt: '2025-06-14',
      hiredAt: '2024-01-15',
      absences: [],
    });
    const normal = run([person({ id: 1, cadence: overdue })]);
    expect(normal.find((a) => a.type === 'one_on_one_overdue')?.severity).toBe(
      'warning',
    );

    const risky = run([
      person({ id: 2, cadence: overdue, flightRisk: 'высокий' }),
    ]);
    expect(risky.find((a) => a.type === 'one_on_one_overdue')?.severity).toBe(
      'critical',
    );
  });

  it('ловит резкое падение мотивации', () => {
    const alerts = run([
      person({
        id: 1,
        checkins: [
          { measuredAt: '2025-06-25', motivation: 2, workloadPressure: 3, satisfaction: 4 },
          { measuredAt: '2025-06-10', motivation: 4, workloadPressure: 3, satisfaction: 4 },
          { measuredAt: '2025-05-27', motivation: 4, workloadPressure: 3, satisfaction: 4 },
        ],
      }),
    ]);
    expect(alerts.find((a) => a.type === 'climate_drop')?.severity).toBe('critical');
  });

  it('не считает падением обычные колебания на один пункт', () => {
    const alerts = run([
      person({
        id: 1,
        checkins: [
          { measuredAt: '2025-06-25', motivation: 3, workloadPressure: 3, satisfaction: 4 },
          { measuredAt: '2025-06-10', motivation: 4, workloadPressure: 3, satisfaction: 4 },
        ],
      }),
    ]);
    expect(alerts.find((a) => a.type === 'climate_drop')).toBeUndefined();
  });

  it('замечает устойчивую перегрузку два замера подряд', () => {
    const alerts = run([
      person({
        id: 1,
        checkins: [
          { measuredAt: '2025-06-25', motivation: 3, workloadPressure: 5, satisfaction: 3 },
          { measuredAt: '2025-06-10', motivation: 3, workloadPressure: 4, satisfaction: 3 },
        ],
      }),
    ]);
    expect(alerts.find((a) => a.type === 'climate_low_sustained')?.severity).toBe(
      'critical',
    );
  });

  it('требует первого 1-1 с новичком, но не раньше недели', () => {
    const week = (hiredAt: string) =>
      computeCadence({ today: TODAY, cadenceDays: 7, lastDoneAt: null, hiredAt, absences: [] });

    const fresh = run([
      person({ id: 1, hiredAt: '2025-06-26', cadence: week('2025-06-26') }),
    ]);
    expect(fresh.find((a) => a.type === 'first_one_on_one_missing')).toBeUndefined();

    const stale = run([
      person({ id: 2, hiredAt: '2025-06-10', cadence: week('2025-06-10') }),
    ]);
    expect(stale.find((a) => a.type === 'first_one_on_one_missing')?.severity).toBe(
      'critical',
    );
  });

  it('напоминает про карма-засуху и формулирует это как задачу лида', () => {
    const alerts = run([person({ id: 1, lastKarmaAt: '2025-01-01' })]);
    const drought = alerts.find((a) => a.type === 'karma_drought');
    expect(drought?.severity).toBe('info');
    expect(drought?.title).toContain('Ты давно');
  });

  it('не жалуется на карма-засуху у смежника — ему карму и не ставят', () => {
    const dry = { lastKarmaAt: '2025-01-01' };
    expect(
      run([person({ id: 1, ...dry })]).some((a) => a.type === 'karma_drought'),
    ).toBe(true);
    expect(
      run([person({ id: 2, kind: 'peer', ...dry })]).some(
        (a) => a.type === 'karma_drought',
      ),
    ).toBe(false);
  });

  it('находит день рождения и помечает его как хорошую новость', () => {
    const alerts = run([person({ id: 1, birthday: '1990-07-03' })]);
    expect(alerts.find((a) => a.type === 'birthday_soon')?.severity).toBe('positive');
  });

  it('скрывает заглушённый алерт до истечения срока заглушки', () => {
    const withOverdue = person({
      id: 1,
      commitments: [
        {
          id: 1,
          direction: 'i_owe',
          title: 'Обещание',
          dueAt: '2025-06-01',
          status: 'open',
          snoozedUntil: null,
        },
      ],
    });
    const key = 'commitment_overdue_mine:person:1';

    expect(run([withOverdue], { [key]: '2025-07-07' })).toHaveLength(0);
    // Срок заглушки истёк — алерт возвращается сам, без ручных действий.
    expect(run([withOverdue], { [key]: '2025-06-29' })).toHaveLength(1);
  });

  it('уважает список включённых типов', () => {
    const alerts = computeAlerts(
      [person({ id: 1, stalledGoals: 2, birthday: '1990-07-01' })],
      { today: TODAY, enabled: ['birthday_soon'] },
    );
    expect(alerts.map((a) => a.type)).toEqual(['birthday_soon']);
  });
});

describe('группировка по людям', () => {
  it('сортирует людей по худшему сигналу, а не по числу сигналов', () => {
    const alerts = run([
      person({ id: 1, noteReviewDue: 1, stalledGoals: 1, skippedStreak: 2 }),
      person({
        id: 2,
        commitments: [
          {
            id: 1,
            direction: 'i_owe',
            title: 'Сломанное обещание',
            dueAt: '2025-06-01',
            status: 'open',
            snoozedUntil: null,
          },
        ],
      }),
    ]);
    const groups = groupByPerson(alerts, { 1: 'Много мелочей', 2: 'Одно важное' });

    expect(groups[0]?.personName).toBe('Одно важное');
    expect(groups[0]?.worstSeverity).toBe('critical');
    expect(groups[1]?.alerts.length).toBeGreaterThan(groups[0]!.alerts.length);
  });

  it('внутри человека ставит критичное первым', () => {
    const alerts = run([
      person({
        id: 1,
        noteReviewDue: 1,
        commitments: [
          {
            id: 1,
            direction: 'i_owe',
            title: 'Сломанное обещание',
            dueAt: '2025-06-01',
            status: 'open',
            snoozedUntil: null,
          },
        ],
      }),
    ]);
    const groups = groupByPerson(alerts, { 1: 'Петя' });
    expect(groups[0]?.alerts[0]?.severity).toBe('critical');
  });

  describe('косяк без разговора', () => {
    it('поднимается и говорит про лида, а не про человека', () => {
      const alerts = computeAlerts([person({ id: 1, undiscussedIssues: 2 })], {
        today: TODAY,
        enabled: ['issue_undiscussed'],
      });
      const found = alerts.find((a) => a.type === 'issue_undiscussed');
      expect(found).toBeDefined();
      expect(found!.severity).toBe('warning');
      // «Записано косяков...» — про твоё бездействие, а не «у него косяки».
      expect(found!.title).toContain('без разговора');
    });

    it('молчит, когда всё проговорено', () => {
      const alerts = computeAlerts([person({ id: 1, undiscussedIssues: 0 })], {
        today: TODAY,
        enabled: ['issue_undiscussed'],
      });
      expect(alerts.some((a) => a.type === 'issue_undiscussed')).toBe(false);
    });
  });
});
