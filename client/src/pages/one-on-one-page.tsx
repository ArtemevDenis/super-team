import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  useKarmaCategories,
  usePersonContext,
  useSaveOneOnOne,
} from '../shared/api';
import { addDays, daysWord, formatDay, formatRelative, today } from '../shared/dates';
import { ClimateSliders } from '../shared/ui/climate-sliders';
import { Button, Panel, TextArea, TextInput } from '../shared/ui/primitives';
import type { CommitmentType } from '../shared/types';

type DraftCommitmentType = {
  direction: 'i_owe' | 'they_owe';
  title: string;
  dueAt: string | null;
};

type CommitmentActionType = 'keep' | 'done' | 'snooze' | 'cancelled';

type DraftType = {
  happenedAt: string;
  notes: string;
  isSensitive: boolean;
  climate: { motivation: number; workloadPressure: number; satisfaction: number } | null;
  actions: Record<number, CommitmentActionType>;
  fresh: DraftCommitmentType[];
  karma: { category: string; description: string }[];
  nextPlannedAt: string | null;
};

export function OneOnOnePage() {
  const { id } = useParams();
  const personId = Number(id);
  const navigate = useNavigate();
  const { data: context, isLoading } = usePersonContext(personId);
  const save = useSaveOneOnOne();

  // Считается до раннего возврата: замыкание handleSave создаётся раньше,
  // и объявление ниже держалось бы только на порядке проверок внутри него.
  const isPeer = context?.person.kind === 'peer';

  const draftKey = `one-on-one-draft:${personId}:${today()}`;
  const [draft, setDraft] = useState<DraftType | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Черновик восстанавливается из localStorage: если тебя выдернут на созвон
  // посреди заполнения, потерять заметки нельзя ни разу — после первого раза
  // в форму просто перестают верить.
  useEffect(() => {
    if (!context || draft) return;

    const stored = localStorage.getItem(draftKey);
    if (stored) {
      try {
        setDraft(JSON.parse(stored) as DraftType);
        return;
      } catch {
        localStorage.removeItem(draftKey);
      }
    }

    const last = context.lastCheckin;
    setDraft({
      happenedAt: today(),
      notes: '',
      isSensitive: false,
      // Слайдеры предзаполнены прошлыми значениями, а не нейтральной тройкой:
      // чаще всего ничего не изменилось, и форму надо просто прокликать.
      climate: last
        ? {
            motivation: last.motivation,
            workloadPressure: last.workloadPressure,
            satisfaction: last.satisfaction,
          }
        : { motivation: 3, workloadPressure: 3, satisfaction: 3 },
      actions: {},
      fresh: [],
      karma: [],
      nextPlannedAt: context.suggestedNextAt,
    });
  }, [context, draft, draftKey]);

  useEffect(() => {
    if (draft) localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, draftKey]);

  const update = (patch: Partial<DraftType>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const openCommitments = useMemo(
    () =>
      context
        ? [...context.openCommitments.iOwe, ...context.openCommitments.theyOwe]
        : [],
    [context],
  );

  const handleSave = () => {
    if (!draft || !context) return;

    const commitmentUpdates = Object.entries(draft.actions)
      .filter(([, action]) => action !== 'keep')
      .map(([commitmentId, action]) => ({
        id: Number(commitmentId),
        status: action === 'snooze' ? ('open' as const) : (action as 'done' | 'cancelled'),
        snoozedUntil: action === 'snooze' ? addDays(today(), 7) : null,
      }));

    save.mutate(
      {
        personId,
        oneOnOneId: context.nextPlanned?.id ?? null,
        happenedAt: draft.happenedAt,
        notes: draft.notes.trim() || null,
        isSensitive: draft.isSensitive,
        climate: isPeer ? null : draft.climate,
        commitmentUpdates,
        newCommitments: draft.fresh
          .filter((c) => c.title.trim())
          .map((c) => ({ direction: c.direction, title: c.title.trim(), dueAt: c.dueAt })),
        karma: draft.karma,
        nextPlannedAt: draft.nextPlannedAt,
      },
      {
        onSuccess: () => {
          localStorage.removeItem(draftKey);
          // Возврат на дашборд, а не на карточку человека: видимое замыкание
          // цикла — то, из чего складывается привычка.
          navigate('/', {
            state: {
              toast: draft.nextPlannedAt
                ? `1-1 сохранён · следующий ${formatDay(draft.nextPlannedAt)}`
                : '1-1 сохранён',
            },
          });
        },
      },
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (isLoading || !context || !draft) {
    return <p className="text-[13px] text-fg-faint">Загружаю…</p>;
  }

  const { person, cadence, lastMeeting } = context;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-24">
      <header>
        <Link to={`/person/${personId}`} className="eyebrow hover:text-fg-dim">
          ← {person.fullName}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Запись 1-1
        </h1>
        <p className="mt-1 text-[13px] text-fg-faint">
          {cadence.lastDoneAt
            ? `Прошлая встреча ${cadence.daysSinceLast} ${daysWord(cadence.daysSinceLast ?? 0)} назад`
            : 'Первая встреча с этим человеком'}
        </p>
      </header>

      {/* Прошлые заметки видны, но свёрнуты: нельзя выполнить договорённость,
          которой не видишь, но и заслонять ими форму не нужно. */}
      {lastMeeting?.notes && (
        <details className="rounded-lg border border-line bg-surface px-4 py-3">
          <summary className="eyebrow cursor-pointer select-none">
            Что было в прошлый раз
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-dim">
            {lastMeeting.notes}
          </p>
        </details>
      )}

      {openCommitments.length > 0 && (
        <Panel title="Договорённости с прошлого раза" count={openCommitments.length}>
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {openCommitments.map((commitment) => (
              <CommitmentRow
                key={commitment.id}
                commitment={commitment}
                action={draft.actions[commitment.id] ?? 'keep'}
                onAction={(action) =>
                  update({ actions: { ...draft.actions, [commitment.id]: action } })
                }
              />
            ))}
          </ul>
        </Panel>
      )}

      {/* Смежникам настрой не замеряют и карму не ставят: их не оценивают,
          с ними договариваются. Показывать пустые блоки — предлагать
          заполнить то, чего у этих отношений нет. */}
      {!isPeer && (
      <Panel title="Как он сейчас">
        <ClimateSliders
          value={draft.climate}
          previous={context.lastCheckin}
          onChange={(climate) => update({ climate })}
          onComplete={() => notesRef.current?.focus()}
        />
      </Panel>
      )}

      <Panel
        title="Заметки"
        action={
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-faint">
            <input
              type="checkbox"
              checked={draft.isSensitive}
              onChange={(e) => update({ isSensitive: e.target.checked })}
              className="accent-critical"
            />
            чувствительно
          </label>
        }
      >
        <TextArea
          ref={notesRef}
          rows={6}
          value={draft.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="О чём говорили, что важно не забыть"
        />
      </Panel>

      <NewCommitments
        items={draft.fresh}
        onChange={(fresh) => update({ fresh })}
      />

      {!isPeer && (
        <KarmaPicker items={draft.karma} onChange={(karma) => update({ karma })} />
      )}

      <Panel title="Следующая встреча">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            type="date"
            value={draft.nextPlannedAt ?? ''}
            onChange={(e) => update({ nextPlannedAt: e.target.value || null })}
            className="w-auto"
          />
          <span className="text-[12px] text-fg-faint">
            {draft.nextPlannedAt
              ? formatRelative(draft.nextPlannedAt)
              : 'не планировать'}
          </span>
          {draft.nextPlannedAt && (
            <Button variant="quiet" onClick={() => update({ nextPlannedAt: null })}>
              не планировать
            </Button>
          )}
        </div>
      </Panel>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3">
          <span className="text-[11px] text-fg-faint">
            Черновик сохраняется сам · ⌘↵ чтобы сохранить
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate(-1)}>отмена</Button>
            <Button variant="solid" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? 'сохраняю…' : 'сохранить 1-1'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommitmentRow({
  commitment,
  action,
  onAction,
}: {
  commitment: CommitmentType;
  action: CommitmentActionType;
  onAction: (action: CommitmentActionType) => void;
}) {
  const isMine = commitment.direction === 'i_owe';
  const isOverdue = commitment.dueAt !== null && commitment.dueAt < today();

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
      <span
        className={`eyebrow shrink-0 ${isMine ? 'text-critical' : 'text-fg-faint'}`}
      >
        {isMine ? 'я обещал' : 'он обещал'}
      </span>
      <span
        className={`min-w-0 flex-1 text-[13.5px] ${
          action === 'done' ? 'text-fg-faint line-through' : ''
        }`}
      >
        {commitment.title}
        {commitment.dueAt && (
          <span
            className={`tnum ml-2 text-[12px] ${
              isOverdue ? 'text-critical' : 'text-fg-faint'
            }`}
          >
            {formatRelative(commitment.dueAt)}
          </span>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant={action === 'done' ? 'solid' : 'ghost'}
          onClick={() => onAction(action === 'done' ? 'keep' : 'done')}
        >
          ✓
        </Button>
        <Button
          variant={action === 'snooze' ? 'solid' : 'quiet'}
          onClick={() => onAction(action === 'snooze' ? 'keep' : 'snooze')}
        >
          +1 нед
        </Button>
      </div>
    </li>
  );
}

const DUE_CHIPS: { label: string; days: number | null }[] = [
  { label: 'без срока', days: null },
  { label: '+3 дня', days: 3 },
  { label: '+1 нед', days: 7 },
  { label: '+2 нед', days: 14 },
  { label: '+месяц', days: 30 },
];

function NewCommitments({
  items,
  onChange,
}: {
  items: DraftCommitmentType[];
  onChange: (items: DraftCommitmentType[]) => void;
}) {
  const [direction, setDirection] = useState<'i_owe' | 'they_owe'>('i_owe');
  const [title, setTitle] = useState('');
  const [dueDays, setDueDays] = useState<number | null>(7);

  const add = () => {
    if (!title.trim()) return;
    onChange([
      ...items,
      {
        direction,
        title: title.trim(),
        dueAt: dueDays === null ? null : addDays(today(), dueDays),
      },
    ]);
    setTitle('');
  };

  return (
    <Panel title="О чём договорились" count={items.length}>
      {items.length > 0 && (
        <ul className="mb-2.5 divide-y divide-line-soft rounded-lg border border-line">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-3 px-3.5 py-2">
              <span
                className={`eyebrow shrink-0 ${
                  item.direction === 'i_owe' ? 'text-critical' : 'text-fg-faint'
                }`}
              >
                {item.direction === 'i_owe' ? 'я' : 'он'}
              </span>
              <span className="min-w-0 flex-1 text-[13.5px]">{item.title}</span>
              {item.dueAt && (
                <span className="tnum shrink-0 text-[12px] text-fg-faint">
                  {formatRelative(item.dueAt)}
                </span>
              )}
              <Button
                variant="quiet"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                убрать
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          {/* Переключатель направления первым: обещание лида и обещание
              сотрудника — разные вещи, и путать их нельзя. */}
          <div className="flex shrink-0 overflow-hidden rounded-md border border-line">
            {(['i_owe', 'they_owe'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDirection(value)}
                className={`px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  direction === value
                    ? 'bg-raised text-fg'
                    : 'text-fg-faint hover:text-fg-dim'
                }`}
              >
                {value === 'i_owe' ? 'я обещал' : 'он обещал'}
              </button>
            ))}
          </div>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Что именно — и Enter"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DUE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setDueDays(chip.days)}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                dueDays === chip.days
                  ? 'border-fg-faint text-fg'
                  : 'border-line text-fg-faint hover:text-fg-dim'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function KarmaPicker({
  items,
  onChange,
}: {
  items: { category: string; description: string }[];
  onChange: (items: { category: string; description: string }[]) => void;
}) {
  const { data: categories } = useKarmaCategories();
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const add = () => {
    if (!category || !description.trim()) return;
    onChange([...items, { category, description: description.trim() }]);
    setCategory(null);
    setDescription('');
  };

  return (
    <Panel title="Отметить хорошее" count={items.length}>
      {items.length > 0 && (
        <ul className="mb-2.5 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-baseline gap-2 text-[13px]">
              <span className="eyebrow shrink-0 text-positive">{item.category}</span>
              <span className="min-w-0 flex-1">{item.description}</span>
              <Button
                variant="quiet"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                убрать
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(categories ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(category === item.name ? null : item.name)}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
              category === item.name
                ? 'border-positive text-positive'
                : 'border-line text-fg-faint hover:text-fg-dim'
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>

      {category && (
        <div className="mt-2">
          <TextInput
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="За что именно — и Enter"
          />
        </div>
      )}
    </Panel>
  );
}
