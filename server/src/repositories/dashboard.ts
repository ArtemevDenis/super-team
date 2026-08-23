import { and, desc, eq, gte, lte, ne } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  absences,
  climateCheckins,
  commitments,
  departments,
  developmentGoals,
  karmaEntries,
  noteBlocks,
  oneOnOnes,
  people,
  specializations,
} from '../db/schema.js';
import {
  buildAbsenceCalendar,
  type AbsenceCalendarType,
} from '../domain/absence-calendar.js';
import {
  computeAlerts,
  DASHBOARD_GROUP_LIMIT,
  groupByPerson,
  type AlertPersonInputType,
  type AlertTypeKeyType,
  type PersonAlertGroupType,
} from '../domain/alerts.js';
import { computeCadence, type CadenceStateType } from '../domain/cadence.js';
import { undiscussedIssueCount } from '../domain/issues.js';
import { teamClimate, type TeamClimateType } from '../domain/climate.js';
import { addDays, daysBetween, today, type DayType } from '../domain/dates.js';
import { listAbsences } from './people.js';
import { currentTeamId } from './teams.js';
import { undiscussedByPerson } from './issues.js';
import { skippedStreak } from './meetings.js';
import { getEnabledAlerts, listActiveMutes } from './settings.js';

export type DashboardPersonType = {
  id: number;
  fullName: string;
  photoPath: string | null;
  cadence: CadenceStateType;
};

export type UpcomingMeetingType = {
  oneOnOneId: number;
  personId: number;
  personName: string;
  plannedAt: DayType;
  daysUntil: number;
};

export type OverdueCommitmentType = {
  id: number;
  personId: number;
  personName: string;
  direction: 'i_owe' | 'they_owe';
  title: string;
  dueAt: DayType;
  overdueDays: number;
};

export type KarmaFeedItemType = {
  id: number;
  personId: number;
  personName: string;
  category: string;
  description: string;
  happenedAt: DayType;
};

export type GoodNewsType = {
  key: string;
  personId: number;
  personName: string;
  title: string;
  detail: string | null;
};

/** Группа с каденцией: полоса контакта нужна и здесь, а не только у тихих. */
export type DashboardGroupType = PersonAlertGroupType & {
  cadence: CadenceStateType;
  cadenceDays: number;
  photoPath: string | null;
};

export type DashboardType = {
  today: DayType;
  groups: DashboardGroupType[];
  groupsHidden: number;
  /**
   * Позитивные сигналы вынесены из карточек намеренно: внутри красной
   * карточки «день рождения через 4 дня» невидим, а именно он — половина
   * смысла ленты. Сплошь красный дашборд закрывают не читая.
   */
  goodNews: GoodNewsType[];
  upcoming: UpcomingMeetingType[];
  overdueCommitments: OverdueCommitmentType[];
  karmaFeed: KarmaFeedItemType[];
  peopleCount: number;
  quietPeople: DashboardPersonType[];
};

/**
 * Собирает вход для движка алертов одним проходом по нескольким запросам,
 * а не по одному запросу на человека: людей мало, но N+1 на дашборде — это
 * то, что потом невозможно вычистить.
 */
export function buildAlertInputs(day: DayType): {
  inputs: AlertPersonInputType[];
  names: Record<number, string>;
  cadences: Map<number, CadenceStateType>;
} {
  // Дашборд смотрит вперёд, поэтому здесь только активные. Исторические
  // агрегаты (климат за март) наоборот читают строки как есть — это факты
  // о прошлом, и фильтровать их по текущему статусу нельзя.
  const active = db
    .select()
    .from(people)
    .where(and(eq(people.status, 'active'), eq(people.teamId, currentTeamId())))
    .all();
  const names: Record<number, string> = {};
  for (const p of active) names[p.id] = p.fullName;

  const absencesByPerson = new Map<number, { fromDay: string; toDay: string }[]>();
  for (const absence of listAbsences()) {
    const list = absencesByPerson.get(absence.personId) ?? [];
    list.push({ fromDay: absence.fromDay, toDay: absence.toDay });
    absencesByPerson.set(absence.personId, list);
  }

  const lastDoneByPerson = new Map<number, DayType>();
  for (const meeting of db
    .select({ personId: oneOnOnes.personId, happenedAt: oneOnOnes.happenedAt })
    .from(oneOnOnes)
    .where(eq(oneOnOnes.status, 'done'))
    .orderBy(desc(oneOnOnes.happenedAt))
    .all()) {
    if (meeting.happenedAt && !lastDoneByPerson.has(meeting.personId)) {
      lastDoneByPerson.set(meeting.personId, meeting.happenedAt);
    }
  }

  const checkinsByPerson = new Map<number, (typeof climateCheckins.$inferSelect)[]>();
  for (const checkin of db
    .select()
    .from(climateCheckins)
    .orderBy(desc(climateCheckins.measuredAt), desc(climateCheckins.id))
    .all()) {
    const list = checkinsByPerson.get(checkin.personId) ?? [];
    if (list.length < 3) list.push(checkin);
    checkinsByPerson.set(checkin.personId, list);
  }

  const commitmentsByPerson = new Map<number, (typeof commitments.$inferSelect)[]>();
  for (const commitment of db
    .select()
    .from(commitments)
    .where(eq(commitments.status, 'open'))
    .all()) {
    const list = commitmentsByPerson.get(commitment.personId) ?? [];
    list.push(commitment);
    commitmentsByPerson.set(commitment.personId, list);
  }

  const flightRiskByPerson = new Map<number, string | null>();
  const reviewDueByPerson = new Map<number, number>();
  for (const block of db.select().from(noteBlocks).all()) {
    if (block.kind === 'flight_risk') {
      flightRiskByPerson.set(block.personId, block.value);
    }
    if (block.reviewAt && block.reviewAt <= day) {
      reviewDueByPerson.set(
        block.personId,
        (reviewDueByPerson.get(block.personId) ?? 0) + 1,
      );
    }
  }

  const stalledByPerson = new Map<number, number>();
  for (const goal of db
    .select()
    .from(developmentGoals)
    .where(ne(developmentGoals.status, 'готово'))
    .all()) {
    const isStalled =
      goal.status === 'буксует' || (goal.targetAt !== null && goal.targetAt < day);
    if (isStalled) {
      stalledByPerson.set(
        goal.personId,
        (stalledByPerson.get(goal.personId) ?? 0) + 1,
      );
    }
  }

  const lastKarmaByPerson = new Map<number, DayType>();
  for (const entry of db
    .select({ personId: karmaEntries.personId, happenedAt: karmaEntries.happenedAt })
    .from(karmaEntries)
    .orderBy(desc(karmaEntries.happenedAt))
    .all()) {
    if (!lastKarmaByPerson.has(entry.personId)) {
      lastKarmaByPerson.set(entry.personId, entry.happenedAt);
    }
  }

  // Косяки без разговора: считаем просроченными те, что висят дольше порога.
  const issuesByPerson = undiscussedByPerson();

  const cadences = new Map<number, CadenceStateType>();
  const inputs: AlertPersonInputType[] = active.map((person) => {
    const cadence = computeCadence({
      today: day,
      cadenceDays: person.cadenceDays,
      lastDoneAt: lastDoneByPerson.get(person.id) ?? null,
      hiredAt: person.hiredAt,
      absences: absencesByPerson.get(person.id) ?? [],
    });
    cadences.set(person.id, cadence);

    return {
      id: person.id,
      fullName: person.fullName,
      kind: person.kind,
      cadenceDays: person.cadenceDays,
      hiredAt: person.hiredAt,
      probationEndsAt: person.probationEndsAt,
      birthday: person.birthday,
      cadence,
      checkins: checkinsByPerson.get(person.id) ?? [],
      commitments: (commitmentsByPerson.get(person.id) ?? []).map((c) => ({
        id: c.id,
        direction: c.direction,
        title: c.title,
        dueAt: c.dueAt,
        status: c.status,
        snoozedUntil: c.snoozedUntil,
      })),
      skippedStreak: skippedStreak(person.id),
      flightRisk: flightRiskByPerson.get(person.id) ?? null,
      lastKarmaAt: lastKarmaByPerson.get(person.id) ?? null,
      noteReviewDue: reviewDueByPerson.get(person.id) ?? 0,
      stalledGoals: stalledByPerson.get(person.id) ?? 0,
      undiscussedIssues: undiscussedIssueCount(
        issuesByPerson.get(person.id) ?? [],
        day,
      ),
    };
  });

  return { inputs, names, cadences };
}

/**
 * Срез климата по активным людям. Архивированные исключены: это взгляд
 * вперёд, а не исторический агрегат.
 */
export function buildTeamClimate(): TeamClimateType {
  // Смежникам настрой не замеряют: их не оценивают, с ними договариваются.
  const active = db
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        eq(people.status, 'active'),
        eq(people.kind, 'member'),
        eq(people.teamId, currentTeamId()),
      ),
    )
    .all();

  const byPerson = new Map<number, (typeof climateCheckins.$inferSelect)[]>();
  for (const checkin of db
    .select()
    .from(climateCheckins)
    .orderBy(desc(climateCheckins.measuredAt), desc(climateCheckins.id))
    .all()) {
    const list = byPerson.get(checkin.personId) ?? [];
    if (list.length < 2) list.push(checkin);
    byPerson.set(checkin.personId, list);
  }

  return teamClimate(
    active.map((person) => {
      const recent = byPerson.get(person.id) ?? [];
      return {
        personId: person.id,
        latest: recent[0] ?? null,
        previous: recent[1] ?? null,
      };
    }),
  );
}

export function buildCalendar(windowDays = 90): AbsenceCalendarType {
  const day = today();

  const active = db
    .select({
      personId: people.id,
      fullName: people.fullName,
      photoPath: people.photoPath,
      departmentName: departments.name,
      departmentColor: departments.color,
      specializationName: specializations.name,
    })
    .from(people)
    .leftJoin(specializations, eq(people.specializationId, specializations.id))
    .leftJoin(departments, eq(specializations.departmentId, departments.id))
    .where(
      and(
        eq(people.status, 'active'),
        eq(people.kind, 'member'),
        eq(people.teamId, currentTeamId()),
      ),
    )
    .all();

  const rows = db
    .select({
      id: absences.id,
      personId: absences.personId,
      fromDay: absences.fromDay,
      toDay: absences.toDay,
      kind: absences.kind,
    })
    .from(absences)
    .where(gte(absences.toDay, day))
    .all();

  return buildAbsenceCalendar(active, rows, day, windowDays);
}

export function buildDashboard(
  enabledOverride?: readonly AlertTypeKeyType[],
): DashboardType {
  const day = today();
  const { inputs, names, cadences } = buildAlertInputs(day);

  const alerts = computeAlerts(inputs, {
    today: day,
    enabled: enabledOverride ?? getEnabledAlerts(),
    mutes: listActiveMutes(day),
  });

  const goodNews: GoodNewsType[] = alerts
    .filter((alert) => alert.severity === 'positive')
    .map((alert) => ({
      key: alert.key,
      personId: alert.personId,
      personName: names[alert.personId] ?? 'Без имени',
      title: alert.title,
      detail: alert.detail,
    }));

  const cadenceDaysById = new Map(inputs.map((p) => [p.id, p.cadenceDays]));
  const photoById = new Map(
    db
      .select({ id: people.id, photoPath: people.photoPath })
      .from(people)
      .all()
      .map((row) => [row.id, row.photoPath]),
  );

  const allGroups: DashboardGroupType[] = groupByPerson(
    alerts.filter((alert) => alert.severity !== 'positive'),
    names,
  ).map((group) => ({
    ...group,
    cadence: cadences.get(group.personId)!,
    cadenceDays: cadenceDaysById.get(group.personId) ?? 14,
    photoPath: photoById.get(group.personId) ?? null,
  }));

  const horizon = addDays(day, 14);
  const upcoming: UpcomingMeetingType[] = db
    .select({
      id: oneOnOnes.id,
      personId: oneOnOnes.personId,
      plannedAt: oneOnOnes.plannedAt,
      personName: people.fullName,
    })
    .from(oneOnOnes)
    .innerJoin(people, eq(oneOnOnes.personId, people.id))
    .where(
      and(
        eq(oneOnOnes.status, 'planned'),
        eq(people.status, 'active'),
        eq(people.teamId, currentTeamId()),
        lte(oneOnOnes.plannedAt, horizon),
      ),
    )
    .orderBy(oneOnOnes.plannedAt)
    .all()
    .filter((row): row is typeof row & { plannedAt: string } => row.plannedAt !== null)
    .map((row) => ({
      oneOnOneId: row.id,
      personId: row.personId,
      personName: row.personName,
      plannedAt: row.plannedAt,
      daysUntil: daysBetween(day, row.plannedAt),
    }));

  const overdueCommitments: OverdueCommitmentType[] = db
    .select({
      id: commitments.id,
      personId: commitments.personId,
      personName: people.fullName,
      direction: commitments.direction,
      title: commitments.title,
      dueAt: commitments.dueAt,
      snoozedUntil: commitments.snoozedUntil,
    })
    .from(commitments)
    .innerJoin(people, eq(commitments.personId, people.id))
    .where(
      and(
        eq(commitments.status, 'open'),
        eq(people.status, 'active'),
        eq(people.teamId, currentTeamId()),
        lte(commitments.dueAt, addDays(day, -1)),
      ),
    )
    .all()
    .filter(
      (row) =>
        row.dueAt !== null && (!row.snoozedUntil || row.snoozedUntil <= day),
    )
    .map((row) => ({
      id: row.id,
      personId: row.personId,
      personName: row.personName,
      direction: row.direction,
      title: row.title,
      dueAt: row.dueAt as DayType,
      overdueDays: daysBetween(row.dueAt as DayType, day),
    }))
    // Свои сломанные обещания всегда выше чужих.
    .sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'i_owe' ? -1 : 1;
      return b.overdueDays - a.overdueDays;
    });

  const karmaFeed: KarmaFeedItemType[] = db
    .select({
      id: karmaEntries.id,
      personId: karmaEntries.personId,
      personName: people.fullName,
      category: karmaEntries.category,
      description: karmaEntries.description,
      happenedAt: karmaEntries.happenedAt,
    })
    .from(karmaEntries)
    .innerJoin(people, eq(karmaEntries.personId, people.id))
    .where(
      and(
        eq(people.teamId, currentTeamId()),
        gte(karmaEntries.happenedAt, addDays(day, -7)),
      ),
    )
    .orderBy(desc(karmaEntries.happenedAt))
    .all();

  const noisyIds = new Set(allGroups.map((g) => g.personId));
  const quietPeople: DashboardPersonType[] = inputs
    .filter((p) => !noisyIds.has(p.id))
    .map((p) => ({
      id: p.id,
      fullName: p.fullName,
      photoPath: photoById.get(p.id) ?? null,
      cadence: cadences.get(p.id)!,
    }));

  return {
    today: day,
    groups: allGroups.slice(0, DASHBOARD_GROUP_LIMIT),
    groupsHidden: Math.max(0, allGroups.length - DASHBOARD_GROUP_LIMIT),
    goodNews,
    upcoming,
    overdueCommitments,
    karmaFeed,
    peopleCount: inputs.length,
    quietPeople,
  };
}
