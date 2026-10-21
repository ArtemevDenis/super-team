import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

import {
  useClearCompletedTodos,
  useCreateTodo,
  useDeleteTodo,
  usePresentationMode,
  useReorderTodos,
  useTodos,
  useUpdateTodo,
} from '../api';
import { addDays, daysBetween, formatRelative, today } from '../dates';
import type { TodoType } from '../types';

/**
 * Личный список дел. Один и тот же компонент живёт на странице «Дела» и в
 * плавающем виджете, поэтому размеры здесь не зависят от брейкпоинтов:
 * окно виджета узкое, и `sm:` в нём не сработал бы никогда.
 */
export function TodoList({ autoFocus = false }: { autoFocus?: boolean }) {
  const { data: todos = [], isLoading } = useTodos();
  const { data: presentation } = usePresentationMode();

  const open = todos.filter((t) => t.completedAt === null);
  const done = todos
    .filter((t) => t.completedAt !== null)
    .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1));

  return (
    <div className="flex flex-col gap-3">
      <TodoQuickAdd autoFocus={autoFocus} />

      {presentation?.enabled ? (
        <p className="rounded-md border border-dashed border-warning/40 px-3 py-4 text-center text-[12.5px] text-warning">
          Дела скрыты на время показа экрана. Новые добавляются и появятся
          после выключения режима.
        </p>
      ) : isLoading ? null : open.length === 0 && done.length === 0 ? (
        <p className="px-1 py-3 text-center text-[12.5px] text-fg-faint">
          Пусто. Всё, что держишь в голове, — сюда.
        </p>
      ) : (
        <>
          <OpenTodos todos={open} />
          {done.length > 0 && <DoneTodos todos={done} />}
        </>
      )}
    </div>
  );
}

/** Число «горящих»: просроченные и на сегодня — для счётчиков на вкладках. */
export function countBurning(
  items: readonly { dueAt: string | null; completedAt?: string | null }[],
): number {
  const now = today();
  return items.filter((t) => !t.completedAt && t.dueAt !== null && t.dueAt <= now).length;
}

/* ------------------------------ добавление ----------------------------- */

const DUE_CHIPS = [
  { label: 'без срока', days: null },
  { label: 'сегодня', days: 0 },
  { label: 'завтра', days: 1 },
  { label: '+нед', days: 7 },
] as const;

export function TodoQuickAdd({ autoFocus = false }: { autoFocus?: boolean }) {
  const create = useCreateTodo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  // Срок по умолчанию пустой: дедлайн необязателен, и навязанная «неделя»
  // превращала бы каждое второе дело в ложную просрочку.
  const [dueAt, setDueAt] = useState<string | null>(null);

  const submit = () => {
    const text = title.trim();
    if (!text) return;
    create.mutate({ title: text, dueAt });
    setTitle('');
    setDueAt(null);
    inputRef.current?.focus();
  };

  const chipDay = (days: number | null) => (days === null ? null : addDays(today(), days));
  const customPicked = dueAt !== null && !DUE_CHIPS.some((c) => chipDay(c.days) === dueAt);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Новое дело — Enter"
        className="w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13.5px] text-fg placeholder:text-fg-faint focus:border-info focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-1">
        {DUE_CHIPS.map((chip) => {
          const active = chipDay(chip.days) === dueAt;
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => setDueAt(chipDay(chip.days))}
              className={chipClass(active)}
            >
              {chip.label}
            </button>
          );
        })}
        <label className={`${chipClass(customPicked)} relative cursor-pointer`}>
          {customPicked && dueAt ? formatRelative(dueAt) : 'дата…'}
          <input
            type="date"
            onClick={(e) => e.currentTarget.showPicker()}
            value={dueAt ?? ''}
            onChange={(e) => setDueAt(e.target.value || null)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

const chipClass = (active: boolean) =>
  `rounded px-1.5 py-0.5 text-[11.5px] transition-colors ${
    active ? 'bg-raised text-fg' : 'text-fg-faint hover:text-fg-dim'
  }`;

/* ------------------------------- открытые ------------------------------ */

type DropTargetType = { id: number; after: boolean };

function OpenTodos({ todos }: { todos: TodoType[] }) {
  const reorder = useReorderTodos();
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [target, setTarget] = useState<DropTargetType | null>(null);

  const onDragOver = (event: DragEvent<HTMLLIElement>, id: number) => {
    if (draggedId === null) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    if (target?.id !== id || target.after !== after) setTarget({ id, after });
  };

  const finish = () => {
    setDraggedId(null);
    setTarget(null);
  };

  const onDrop = () => {
    if (draggedId === null || target === null || target.id === draggedId) return finish();

    const ids = todos.map((t) => t.id).filter((id) => id !== draggedId);
    const index = ids.indexOf(target.id) + (target.after ? 1 : 0);
    ids.splice(index, 0, draggedId);
    reorder.mutate(ids);
    finish();
  };

  /** Перестановка с клавиатуры: Alt+↑/↓ на строке. */
  const move = (id: number, delta: -1 | 1) => {
    const ids = todos.map((t) => t.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    reorder.mutate(ids);
  };

  return (
    <ul className="flex flex-col">
      {todos.map((todo) => (
        <li
          key={todo.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            setDraggedId(todo.id);
          }}
          onDragOver={(e) => onDragOver(e, todo.id)}
          onDrop={onDrop}
          onDragEnd={finish}
          className={`relative ${draggedId === todo.id ? 'opacity-40' : ''}`}
        >
          {target?.id === todo.id && draggedId !== todo.id && (
            <span
              className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-info ${
                target.after ? '-bottom-px' : '-top-px'
              }`}
            />
          )}
          <TodoRow todo={todo} onMove={(delta) => move(todo.id, delta)} />
        </li>
      ))}
    </ul>
  );
}

function TodoRow({
  todo,
  onMove,
}: {
  todo: TodoType;
  onMove?: (delta: -1 | 1) => void;
}) {
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const isDone = todo.completedAt !== null;

  const saveTitle = () => {
    const text = draft.trim();
    setEditing(false);
    if (text && text !== todo.title) update.mutate({ id: todo.id, title: text });
    else setDraft(todo.title);
  };

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onMove || !e.altKey) return;
    if (e.key === 'ArrowUp') onMove(-1);
    if (e.key === 'ArrowDown') onMove(1);
  };

  return (
    <div
      onKeyDown={onRowKey}
      className="group flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-surface"
    >
      {!isDone && (
        <span
          aria-hidden
          title="Перетащить"
          className="mt-0.5 cursor-grab select-none text-[11px] leading-5 text-fg-faint opacity-0 group-hover:opacity-100"
        >
          ⋮⋮
        </span>
      )}
      <input
        type="checkbox"
        checked={isDone}
        onChange={(e) => update.mutate({ id: todo.id, done: e.target.checked })}
        title={onMove ? 'Alt+↑/↓ — переставить' : undefined}
        className="mt-1 size-3.5 shrink-0 cursor-pointer accent-positive"
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') {
                setDraft(todo.title);
                setEditing(false);
              }
            }}
            className="w-full rounded border border-info bg-surface px-1.5 py-0.5 text-[13.5px] text-fg focus:outline-none"
          />
        ) : (
          <p
            onDoubleClick={() => !isDone && setEditing(true)}
            className={`break-words text-[13.5px] leading-5 ${
              isDone ? 'text-fg-faint line-through' : 'text-fg'
            }`}
          >
            {todo.title}
          </p>
        )}
      </div>

      {!isDone && <DueBadge todo={todo} />}
      <button
        type="button"
        onClick={() => remove.mutate(todo.id)}
        aria-label="Удалить"
        className="shrink-0 px-0.5 text-[13px] leading-5 text-fg-faint opacity-0 hover:text-critical group-hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Срок правится по клику на него же. Без срока бейдж появляется только при
 * наведении: иначе строка из одних «+ срок» шумит сильнее самих дел.
 */
function DueBadge({ todo }: { todo: TodoType }) {
  const update = useUpdateTodo();
  const diff = todo.dueAt ? daysBetween(today(), todo.dueAt) : null;

  const tone =
    diff === null
      ? 'text-fg-faint opacity-0 group-hover:opacity-100'
      : diff < 0
        ? 'text-critical'
        : diff === 0
          ? 'text-warning'
          : 'text-fg-faint';

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <label className={`tnum relative cursor-pointer text-[11.5px] leading-5 ${tone}`}>
        {todo.dueAt ? formatRelative(todo.dueAt) : '+ срок'}
        <input
          type="date"
          onClick={(e) => e.currentTarget.showPicker()}
          value={todo.dueAt ?? ''}
          onChange={(e) => update.mutate({ id: todo.id, dueAt: e.target.value || null })}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {todo.dueAt && (
        <button
          type="button"
          onClick={() => update.mutate({ id: todo.id, dueAt: null })}
          aria-label="Убрать срок"
          className="text-[11px] leading-5 text-fg-faint opacity-0 hover:text-fg-dim group-hover:opacity-100"
        >
          ⊘
        </button>
      )}
    </span>
  );
}

/* ------------------------------- сделанные ----------------------------- */

function DoneTodos({ todos }: { todos: TodoType[] }) {
  const clear = useClearCompletedTodos();
  const [open, setOpen] = useState(false);

  return (
    <section className="border-t border-line-soft pt-2">
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="eyebrow hover:text-fg-dim"
        >
          готово <span className="tnum normal-case tracking-normal">{todos.length}</span>{' '}
          {open ? '▴' : '▾'}
        </button>
        {open && (
          <button
            type="button"
            onClick={() => clear.mutate()}
            className="ml-auto text-[11.5px] text-fg-faint hover:text-critical"
          >
            убрать все
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-1 flex flex-col">
          {todos.map((todo) => (
            <li key={todo.id}>
              <TodoRow todo={todo} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
