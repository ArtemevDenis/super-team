import { useEffect, useRef, useState } from 'react';

import {
  useConfirmNoteBlock,
  useNoteBlockSpecs,
  useSaveNoteBlock,
} from '../api';
import { daysWord, formatDay } from '../dates';
import { Button, TextArea } from './primitives';
import type { NoteBlockSpecType, NoteBlockType } from '../types';

/**
 * Пять структурированных блоков вместо свободной заметки.
 *
 * Свободный текст не поддерживается в актуальном состоянии: через четыре
 * месяца это устаревшая запись, которой сам не веришь. Структура плюс дата
 * пересмотра превращают её в то, что можно перечитать перед встречей
 * и обновить за минуту.
 */
export function NoteBlocks({
  personId,
  blocks,
}: {
  personId: number;
  blocks: NoteBlockType[];
}) {
  const { data: specs } = useNoteBlockSpecs();
  if (!specs) return null;

  return (
    <ul className="space-y-2.5">
      {specs.map((spec) => (
        <NoteBlockRow
          key={spec.kind}
          personId={personId}
          spec={spec}
          block={blocks.find((b) => b.kind === spec.kind) ?? null}
        />
      ))}
    </ul>
  );
}

function NoteBlockRow({
  personId,
  spec,
  block,
}: {
  personId: number;
  spec: NoteBlockSpecType;
  block: NoteBlockType | null;
}) {
  const save = useSaveNoteBlock();
  const confirm = useConfirmNoteBlock();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(block?.content ?? '');
  const [value, setValue] = useState(block?.value ?? '');
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  const isEmpty = !block || (!block.content && !block.value);
  const isDue = block?.staleness.isDue ?? false;

  const startEditing = () => {
    setContent(block?.content ?? '');
    setValue(block?.value ?? '');
    setEditing(true);
  };

  const submit = () => {
    save.mutate(
      {
        personId,
        kind: spec.kind,
        content: content.trim() || null,
        value: value || null,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  // Пустой блок — одна большая кнопка, а не подпись с тихой ссылкой сбоку.
  // Текст-подсказка того же цвета, что и содержимое, читается как «тут уже
  // что-то написано, просто скучное», и блок молча остаётся незаполненным.
  if (isEmpty && !editing) {
    return (
      <li>
        <button
          type="button"
          onClick={startEditing}
          className="group flex w-full items-baseline gap-x-3 gap-y-1 rounded-lg border border-dashed border-line bg-transparent px-4 py-3 text-left transition-colors hover:border-fg-faint hover:bg-surface"
        >
          <span className="eyebrow shrink-0">{spec.title}</span>
          <span className="min-w-0 flex-1 text-[13px] text-fg-faint">
            {spec.placeholder}
          </span>
          <span className="shrink-0 text-[12px] text-fg-faint transition-colors group-hover:text-fg-dim">
            + заполнить
          </span>
        </button>
      </li>
    );
  }

  return (
    <li
      className={`rounded-lg border bg-surface px-4 py-3 ${
        isDue ? 'border-warning/40' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="eyebrow">{spec.title}</span>

        {block?.isSensitive && (
          <span
            className="text-[11px] text-fg-faint"
            title="Скрывается в режиме шара экрана"
          >
            чувствительно
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {isDue && !editing && (
            // Переподтвердить без правки — отдельное действие: иначе
            // единственный способ снять просрочку это сделать вид,
            // что что-то поменялось.
            <Button
              onClick={() => confirm.mutate({ personId, kind: spec.kind })}
              disabled={confirm.isPending}
            >
              всё ещё так
            </Button>
          )}
          {!editing && (
            <Button onClick={startEditing}>изменить</Button>
          )}
        </div>
      </div>

      {isDue && !editing && (
        <p className="mt-1 text-[11.5px] text-warning">
          Пора пересмотреть — {block!.staleness.daysOverdue === 0
            ? 'срок сегодня'
            : `просрочено на ${block!.staleness.daysOverdue} ${daysWord(block!.staleness.daysOverdue)}`}
        </p>
      )}

      {editing ? (
        <div className="mt-2.5 space-y-2">
          {spec.options && (
            <div className="flex flex-wrap gap-1.5">
              {spec.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setValue(value === option ? '' : option)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    value === option
                      ? 'border-critical bg-critical/10 text-critical'
                      : 'border-line text-fg-faint hover:text-fg-dim'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <TextArea
            ref={textRef}
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder={spec.placeholder}
          />

          <div className="flex items-center gap-2">
            <Button variant="solid" onClick={submit} disabled={save.isPending}>
              сохранить
            </Button>
            <Button variant="quiet" onClick={() => setEditing(false)}>
              отмена
            </Button>
            <span className="ml-auto text-[11px] text-fg-faint">
              пересмотр через {spec.reviewAfterDays} дней · ⌘↵
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1.5">
          {block?.value && (
            <span
              className={`mr-2 text-[13.5px] font-medium ${
                block.value === 'высокий'
                  ? 'text-critical'
                  : block.value === 'средний'
                    ? 'text-warning'
                    : 'text-fg-dim'
              }`}
            >
              {block.value}
            </span>
          )}
          {block?.content && (
            <span className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-dim">
              {block.content}
            </span>
          )}
          {block?.confirmedAt && (
            <p className="tnum mt-1.5 text-[11px] text-fg-faint">
              подтверждено {formatDay(block.confirmedAt)}
              {block.reviewAt && ` · пересмотр ${formatDay(block.reviewAt)}`}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
