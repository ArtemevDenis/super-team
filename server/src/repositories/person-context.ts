import { and, desc, eq, gte } from 'drizzle-orm';

import { db } from '../db/index.js';
import { climateCheckins, karmaEntries } from '../db/schema.js';
import type { CadenceStateType } from '../domain/cadence.js';
import { computeCadence } from '../domain/cadence.js';
import { addDays, today, type DayType } from '../domain/dates.js';
import { summarizeKarma, type KarmaSummaryType } from '../domain/karma.js';
import { specFor } from '../domain/note-blocks.js';
import {
  getLastDoneOneOnOne,
  getNextPlanned,
  listOpenCommitments,
  skippedStreak,
  type CommitmentType,
  type KarmaEntryType,
  type OneOnOneType,
} from './meetings.js';
import { listNoteBlocks, type NoteBlockViewType } from './note-blocks.js';
import { listIssues } from './issues.js';
import { getPerson, listAbsences, type PersonWithRefsType } from './people.js';

export type PersonContextType = {
  person: PersonWithRefsType;
  cadence: CadenceStateType;
  lastMeeting: OneOnOneType | null;
  nextPlanned: OneOnOneType | null;
  openCommitments: { iOwe: CommitmentType[]; theyOwe: CommitmentType[] };
  /** Последние замеры для спарклайна, новые первыми. */
  recentCheckins: (typeof climateCheckins.$inferSelect)[];
  /** Значения прошлого замера — ими предзаполняются слайдеры формы. */
  lastCheckin: (typeof climateCheckins.$inferSelect) | null;
  karmaSinceLastMeeting: KarmaEntryType[];
  karmaSummary: KarmaSummaryType;
  noteBlocks: NoteBlockViewType[];
  suggestedNextAt: DayType;
  skippedStreak: number;
  /**
   * Готовая повестка из незакрытого — её не надо придумывать заново.
   * Пункты помечены: строка «пора пересмотреть: риск ухода» выдаёт на общем
   * экране ровно то, что мы прячем, поэтому строкой она быть не может.
   */
  suggestedAgenda: { text: string; isSensitive: boolean }[];
};

/**
 * Общий контекст для формы 1-1 и экрана подготовки к встрече. Оба экрана
 * отвечают на один вопрос — «о чём мы договаривались в прошлый раз» — просто
 * один до встречи, другой после.
 */
export function getPersonContext(personId: number): PersonContextType | null {
  const person = getPerson(personId);
  if (!person) return null;

  const day = today();
  const lastMeeting = getLastDoneOneOnOne(personId);

  const cadence = computeCadence({
    today: day,
    cadenceDays: person.cadenceDays,
    lastDoneAt: lastMeeting?.happenedAt ?? null,
    hiredAt: person.hiredAt,
    absences: listAbsences(personId).map((a) => ({
      fromDay: a.fromDay,
      toDay: a.toDay,
    })),
  });

  const open = listOpenCommitments(personId);
  const recentCheckins = db
    .select()
    .from(climateCheckins)
    .where(eq(climateCheckins.personId, personId))
    .orderBy(desc(climateCheckins.measuredAt), desc(climateCheckins.id))
    .limit(12)
    .all();

  const karmaSinceLastMeeting = lastMeeting?.happenedAt
    ? db
        .select()
        .from(karmaEntries)
        .where(
          and(
            eq(karmaEntries.personId, personId),
            gte(karmaEntries.happenedAt, lastMeeting.happenedAt),
          ),
        )
        .orderBy(desc(karmaEntries.happenedAt))
        .all()
    : [];

  const iOwe = open.filter((c) => c.direction === 'i_owe');
  const theyOwe = open.filter((c) => c.direction === 'they_owe');

  const noteBlocks = listNoteBlocks(personId);

  /**
   * Непроговорённые косяки идут в повестку первыми.
   *
   * Ради этого раздел и задумывался: увидеть их надо до встречи, а не
   * вспомнить через полгода на ревью. Пункт не помечен чувствительным —
   * косяки решено показывать честно наравне с хорошим.
   */
  const openIssues = listIssues(personId).filter((i) => i.discussedAt === null);

  const suggestedAgenda: { text: string; isSensitive: boolean }[] = [
    ...openIssues.map((i) => ({ text: `Разобрать: ${i.description}`, isSensitive: false })),
    ...iOwe.map((c) => ({ text: `Я обещал: ${c.title}`, isSensitive: false })),
    ...theyOwe.map((c) => ({ text: `Он обещал: ${c.title}`, isSensitive: false })),
  ];
  if (cadence.overdueDays > 14) {
    suggestedAgenda.unshift({
      text: 'Давно не виделись — спросить, как дела в целом',
      isSensitive: false,
    });
  }
  // Протухший блок — готовый пункт повестки: перечитать цель вместе с
  // человеком дешевле, чем однажды обнаружить, что она устарела на год.
  for (const block of noteBlocks) {
    if (block.staleness.isDue) {
      const spec = specFor(block.kind);
      suggestedAgenda.push({
        text: `Пора пересмотреть: ${(spec?.title ?? block.kind).toLowerCase()}`,
        isSensitive: block.isSensitive || spec?.isSensitiveByDefault === true,
      });
    }
  }

  return {
    person,
    cadence,
    lastMeeting,
    nextPlanned: getNextPlanned(personId),
    openCommitments: { iOwe, theyOwe },
    recentCheckins,
    lastCheckin: recentCheckins[0] ?? null,
    karmaSinceLastMeeting,
    noteBlocks,
    karmaSummary: summarizeKarma(
      db
        .select({
          category: karmaEntries.category,
          happenedAt: karmaEntries.happenedAt,
        })
        .from(karmaEntries)
        .where(eq(karmaEntries.personId, personId))
        .all(),
      day,
    ),
    suggestedNextAt: addDays(day, person.cadenceDays),
    skippedStreak: skippedStreak(personId),
    suggestedAgenda,
  };
}
