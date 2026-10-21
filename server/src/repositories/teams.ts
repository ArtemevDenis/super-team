import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
  attributes,
  DEFAULT_KARMA_CATEGORIES,
  departments,
  gradeExpectations,
  grades,
  karmaCategories,
  people,
  teams,
  users,
} from '../db/schema.js';
import { requireContext } from '../auth/context.js';
import { CORE_ATTRIBUTES, GRADE_EXPECTATIONS } from '../domain/attribute-defaults.js';
import { nowTs } from '../domain/dates.js';

export type TeamType = typeof teams.$inferSelect;

/** Команды текущего пользователя. Чужие не видны нигде и никогда. */
export function listTeams(userId = requireContext().userId): TeamType[] {
  return db
    .select()
    .from(teams)
    .where(eq(teams.ownerId, userId))
    .orderBy(asc(teams.sortOrder), asc(teams.id))
    .all();
}

/** Принадлежит ли команда пользователю — проверка перед любым действием над ней. */
export function ownsTeam(teamId: number, userId = requireContext().userId): boolean {
  return Boolean(
    db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.ownerId, userId)))
      .get(),
  );
}

/**
 * Идентификатор текущей команды.
 *
 * Единственная точка, откуда его берут все репозитории. Разнеси её по
 * вызовам — и однажды в одном запросе фильтр забудут, а чужие люди
 * появятся в списке тихо, без всякой ошибки.
 *
 * Значение приходит из контекста запроса, а не из настроек сервера:
 * команда — это то, что смотрит конкретный пользователь, а не процесс.
 */
export function currentTeamId(): number {
  return requireContext().teamId;
}

/** Подзапрос «люди текущей команды» — для таблиц, у которых своей команды нет. */
export function teamPersonIds() {
  return db.select({ id: people.id }).from(people).where(eq(people.teamId, currentTeamId()));
}

/**
 * Активная команда пользователя на момент входа в запрос.
 *
 * Здесь же лечится случай удалённой команды: откатываемся на первую свою.
 * Возвращает null, только если у пользователя нет ни одной команды.
 */
export function resolveActiveTeam(userId: number, stored: number | null): number | null {
  if (stored !== null && ownsTeam(stored, userId)) return stored;

  const first = listTeams(userId)[0];
  if (!first) return null;
  setActiveTeam(first.id, userId);
  return first.id;
}

export function setActiveTeam(id: number, userId = requireContext().userId): void {
  db.update(users)
    .set({ activeTeamId: id, updatedAt: nowTs() })
    .where(eq(users.id, userId))
    .run();
}

/**
 * Новая команда заводится сразу пригодной к работе.
 *
 * При полной изоляции пустая команда означала бы, что общий уровень не
 * считается, грейдов нет и карму поставить не за что — то есть первые
 * полчаса ушли бы на настройку вместо работы.
 */
export function createTeam(
  input: { name: string; color?: string },
  ownerId = requireContext().userId,
): TeamType {
  return db.transaction((tx) => {
    const maxOrder = tx
      .select()
      .from(teams)
      .where(eq(teams.ownerId, ownerId))
      .all()
      .reduce((max, row) => Math.max(max, row.sortOrder), -1);

    const team = tx
      .insert(teams)
      .values({
        ownerId,
        name: input.name,
        color: input.color ?? '#6366f1',
        sortOrder: maxOrder + 1,
      })
      .returning()
      .get();

    tx.insert(karmaCategories)
      .values(
        DEFAULT_KARMA_CATEGORIES.map((name, index) => ({
          teamId: team.id,
          name,
          sortOrder: index,
        })),
      )
      .run();

    const gradeRows = tx
      .insert(grades)
      .values(
        Object.keys(GRADE_EXPECTATIONS).map((name, index) => ({
          teamId: team.id,
          name,
          level: index + 1,
        })),
      )
      .returning()
      .all();

    const attributeRows = tx
      .insert(attributes)
      .values(
        CORE_ATTRIBUTES.map((attribute, index) => ({
          teamId: team.id,
          key: `${attribute.key}_t${team.id}`,
          name: attribute.name,
          shortCode: attribute.shortCode,
          kind: 'core' as const,
          specializationId: null,
          axis: attribute.axis,
          description: attribute.description,
          sortOrder: index,
        })),
      )
      .returning()
      .all();

    const byKey = new Map(
      attributeRows.map((row) => [row.key.replace(`_t${team.id}`, ''), row.id]),
    );

    for (const grade of gradeRows) {
      const profile = GRADE_EXPECTATIONS[grade.name];
      if (!profile) continue;

      tx.insert(gradeExpectations)
        .values(
          Object.entries(profile)
            .filter(([key]) => byKey.has(key))
            .map(([key, expectedValue]) => ({
              gradeId: grade.id,
              attributeId: byKey.get(key)!,
              expectedValue,
            })),
        )
        .run();
    }

    return team;
  });
}

export function updateTeam(
  id: number,
  input: { name?: string; color?: string },
): TeamType | null {
  // Проверка владения здесь, а не в роуте: репозиторий — единственное место,
  // через которое команда вообще меняется, и забыть его нельзя.
  if (!ownsTeam(id)) return null;
  return (
    db
      .update(teams)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(teams.id, id))
      .returning()
      .get() ?? null
  );
}

export type TeamUsageType = { people: number };

export function teamUsage(id: number): TeamUsageType {
  return {
    people: db.select({ id: people.id }).from(people).where(eq(people.teamId, id)).all()
      .length,
  };
}

/**
 * Удаление команды каскадом сносит всё: людей, встречи, оценки, историю.
 * Поэтому удаляются только пустые, а последнюю нельзя удалить вовсе —
 * приложению нужна хотя бы одна.
 */
export function removeTeam(id: number): { deleted: boolean; reason?: string } {
  if (!ownsTeam(id)) return { deleted: false, reason: 'Нет такой команды' };

  if (listTeams().length <= 1) {
    return { deleted: false, reason: 'Это единственная команда' };
  }

  const usage = teamUsage(id);
  if (usage.people > 0) {
    return {
      deleted: false,
      reason: `В команде ${usage.people} человек — удаление снесло бы всю их историю`,
    };
  }

  db.delete(teams).where(eq(teams.id, id)).run();
  db.delete(departments).where(eq(departments.teamId, id)).run();
  return { deleted: true };
}
