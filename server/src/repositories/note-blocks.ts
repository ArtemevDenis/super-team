import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { noteBlocks } from '../db/schema.js';
import { addDays, nowTs, today, type DayType } from '../domain/dates.js';
import {
  noteBlockStaleness,
  specFor,
  type NoteBlockKindType,
  type NoteBlockStalenessType,
} from '../domain/note-blocks.js';

export type NoteBlockRowType = typeof noteBlocks.$inferSelect;

export type NoteBlockViewType = NoteBlockRowType & {
  staleness: NoteBlockStalenessType;
};

export function listNoteBlocks(personId: number): NoteBlockViewType[] {
  const day = today();
  return db
    .select()
    .from(noteBlocks)
    .where(eq(noteBlocks.personId, personId))
    .all()
    .map((block) => ({ ...block, staleness: noteBlockStaleness(block, day) }));
}

export type SaveNoteBlockInputType = {
  personId: number;
  kind: NoteBlockKindType;
  content?: string | null;
  value?: string | null;
  isSensitive?: boolean;
  /** Явная дата пересмотра; по умолчанию считается от срока блока. */
  reviewAt?: DayType | null;
};

/**
 * Один блок каждого вида на человека, поэтому не create/update, а upsert:
 * две «карьерных цели» у одного человека — это не фича, а расхождение,
 * после которого непонятно, какой из них верить.
 */
export function saveNoteBlock(input: SaveNoteBlockInputType): NoteBlockViewType {
  const day = today();
  const spec = specFor(input.kind);
  const reviewAt =
    input.reviewAt !== undefined
      ? input.reviewAt
      : addDays(day, spec?.reviewAfterDays ?? 180);

  const values = {
    personId: input.personId,
    kind: input.kind,
    content: input.content ?? null,
    value: input.value ?? null,
    isSensitive: input.isSensitive ?? spec?.isSensitiveByDefault ?? false,
    reviewAt,
    confirmedAt: day,
    updatedAt: nowTs(),
  };

  const saved = db
    .insert(noteBlocks)
    .values(values)
    .onConflictDoUpdate({
      target: [noteBlocks.personId, noteBlocks.kind],
      set: values,
    })
    .returning()
    .get();

  return { ...saved, staleness: noteBlockStaleness(saved, day) };
}

/**
 * Переподтверждение без правки: содержимое не изменилось, но ты его
 * перечитал и признал верным. Отдельное действие, потому что иначе
 * единственный способ снять просрочку — сделать вид, что что-то поменял.
 */
export function confirmNoteBlock(
  personId: number,
  kind: NoteBlockKindType,
): NoteBlockViewType | null {
  const day = today();
  const spec = specFor(kind);

  const saved = db
    .update(noteBlocks)
    .set({
      confirmedAt: day,
      reviewAt: addDays(day, spec?.reviewAfterDays ?? 180),
      updatedAt: nowTs(),
    })
    .where(and(eq(noteBlocks.personId, personId), eq(noteBlocks.kind, kind)))
    .returning()
    .get();

  return saved ? { ...saved, staleness: noteBlockStaleness(saved, day) } : null;
}

export function deleteNoteBlock(personId: number, kind: NoteBlockKindType): void {
  db.delete(noteBlocks)
    .where(and(eq(noteBlocks.personId, personId), eq(noteBlocks.kind, kind)))
    .run();
}
