import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { karmaEntries, people } from '../db/schema.js';
import { addDays, today, type DayType } from '../domain/dates.js';
import { currentTeamId } from './teams.js';
import {
  KARMA_WINDOW_DAYS,
  summarizeKarma,
  type KarmaSummaryType,
} from '../domain/karma.js';

export type KarmaRecordType = {
  id: number;
  personId: number;
  personName: string;
  category: string;
  /** За что именно. Ради этого текста карма и ведётся. */
  description: string;
  happenedAt: DayType;
};

export type TeamKarmaRowType = {
  personId: number;
  personName: string;
  summary: KarmaSummaryType;
};

export type TeamKarmaType = {
  today: DayType;
  windowDays: number;
  rows: TeamKarmaRowType[];
  /** Лента за окно с описаниями — основное содержимое виджета. */
  records: KarmaRecordType[];
  categories: string[];
  /**
   * Самоаудит: сколько записей сделал сам лид и скольких людей это коснулось.
   * Карма — единственное место в приложении, где фиксируется хорошее, и
   * пустота здесь говорит о лиде, а не о команде.
   */
  givenInWindow: number;
  peopleTouched: number;
  /** Активные, кого не отмечали ни разу за окно. */
  neverMarked: { personId: number; personName: string }[];
};

export function buildTeamKarma(windowDays = KARMA_WINDOW_DAYS): TeamKarmaType {
  const day = today();
  const windowStart = addDays(day, -windowDays);

  const active = db
    .select({ id: people.id, fullName: people.fullName })
    .from(people)
    .where(
      and(
        eq(people.status, 'active'),
        eq(people.kind, 'member'),
        eq(people.teamId, currentTeamId()),
      ),
    )
    .all();

  const entries = db
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
    // Фильтр по команде именно здесь, а не по списку active выше: записи
    // отдаются наружу как есть, в ленту и в счётчик самоаудита. Без него
    // пустая команда показывала «отмечено 25 раз · 11 из 0 человек».
    .where(eq(people.teamId, currentTeamId()))
    .orderBy(desc(karmaEntries.happenedAt), desc(karmaEntries.id))
    .all();

  const byPerson = new Map<number, typeof entries>();
  for (const item of entries) {
    byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item]);
  }

  const rows: TeamKarmaRowType[] = active.map((person) => ({
    personId: person.id,
    personName: person.fullName,
    summary: summarizeKarma(byPerson.get(person.id) ?? [], day, windowDays),
  }));

  const inWindow = entries.filter((e) => e.happenedAt >= windowStart);

  return {
    today: day,
    windowDays,
    rows,
    records: inWindow,
    // Категории из самих записей, а не только из настроек: под скрытой или
    // переименованной категорией история всё равно должна фильтроваться.
    categories: [...new Set(entries.map((e) => e.category))].sort(),
    givenInWindow: inWindow.length,
    peopleTouched: new Set(inWindow.map((e) => e.personId)).size,
    neverMarked: rows
      .filter((row) => row.summary.inWindow === 0)
      .map((row) => ({ personId: row.personId, personName: row.personName })),
  };
}

/** Сводка по одному человеку — для карточки и будущего отчёта за период. */
export function personKarmaSummary(
  personId: number,
  windowDays = KARMA_WINDOW_DAYS,
): KarmaSummaryType {
  return summarizeKarma(
    db
      .select({
        category: karmaEntries.category,
        happenedAt: karmaEntries.happenedAt,
      })
      .from(karmaEntries)
      .where(eq(karmaEntries.personId, personId))
      .all(),
    today(),
    windowDays,
  );
}
