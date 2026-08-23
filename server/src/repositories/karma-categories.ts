import { asc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { DEFAULT_KARMA_CATEGORIES, karmaCategories, karmaEntries } from '../db/schema.js';
import { nowTs } from '../domain/dates.js';
import { currentTeamId } from './teams.js';

export type KarmaCategoryRowType = typeof karmaCategories.$inferSelect;

/** Идемпотентно: на пустой базе создаёт набор по умолчанию. */
export function ensureDefaultKarmaCategories(): void {
  const teamId = currentTeamId();
  const existing = db
    .select({ id: karmaCategories.id })
    .from(karmaCategories)
    .where(eq(karmaCategories.teamId, teamId))
    .get();
  if (existing) return;

  db.insert(karmaCategories)
    .values(
      DEFAULT_KARMA_CATEGORIES.map((name, index) => ({
        teamId,
        name,
        sortOrder: index,
      })),
    )
    .run();
}

export function listKarmaCategories(includeHidden = false): KarmaCategoryRowType[] {
  const query = db
    .select()
    .from(karmaCategories)
    .where(eq(karmaCategories.teamId, currentTeamId()))
    .orderBy(asc(karmaCategories.sortOrder), asc(karmaCategories.name));

  return includeHidden
    ? query.all()
    : query.all().filter((category) => category.isActive);
}

export function isKnownCategory(name: string): boolean {
  return listKarmaCategories().some((category) => category.name === name);
}

export function createKarmaCategory(input: { name: string }): KarmaCategoryRowType {
  const maxOrder = listKarmaCategories(true).reduce(
    (max, category) => Math.max(max, category.sortOrder),
    -1,
  );

  return db
    .insert(karmaCategories)
    .values({ teamId: currentTeamId(), name: input.name, sortOrder: maxOrder + 1 })
    .returning()
    .get();
}

/**
 * Переименование переносит и прошлые записи: они хранят название строкой,
 * и без переноса история осталась бы под старым именем, которого больше
 * нет ни в одном списке — то есть стала бы невидимой в фильтрах.
 */
export function updateKarmaCategory(
  id: number,
  input: { name?: string; isActive?: boolean },
): KarmaCategoryRowType | null {
  return db.transaction((tx) => {
    const before = tx
      .select()
      .from(karmaCategories)
      .where(eq(karmaCategories.id, id))
      .get();
    if (!before) return null;

    const after = tx
      .update(karmaCategories)
      .set({ ...input, updatedAt: nowTs() })
      .where(eq(karmaCategories.id, id))
      .returning()
      .get();

    if (input.name && input.name !== before.name) {
      tx.update(karmaEntries)
        .set({ category: input.name, updatedAt: nowTs() })
        .where(eq(karmaEntries.category, before.name))
        .run();
    }

    return after;
  });
}

export type KarmaCategoryDeletionType =
  | { deleted: true }
  | { deleted: false; hidden: true; usedBy: number };

/**
 * Категория с записями не удаляется, а прячется: удаление оставило бы
 * историю под названием, которого нет, и человек молча потерял бы часть
 * своих отметок из виду.
 */
export function removeKarmaCategory(id: number): KarmaCategoryDeletionType | null {
  const category = db
    .select()
    .from(karmaCategories)
    .where(eq(karmaCategories.id, id))
    .get();
  if (!category) return null;

  const usedBy = db
    .select({ id: karmaEntries.id })
    .from(karmaEntries)
    .where(eq(karmaEntries.category, category.name))
    .all().length;

  if (usedBy > 0) {
    db.update(karmaCategories)
      .set({ isActive: false, updatedAt: nowTs() })
      .where(eq(karmaCategories.id, id))
      .run();
    return { deleted: false, hidden: true, usedBy };
  }

  db.delete(karmaCategories).where(eq(karmaCategories.id, id)).run();
  return { deleted: true };
}
