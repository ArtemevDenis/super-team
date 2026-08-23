import { useState } from 'react';

import { useCreateCommitment } from '../api';
import { addDays, today } from '../dates';
import { Button, TextInput } from './primitives';

/**
 * Завести обещание, не заходя в форму 1-1.
 *
 * Договорённости появляются не только на встречах: в коридоре, в переписке,
 * на планёрке. Пока единственный вход был внутри 1-1, всё, о чём вы
 * договорились между встречами, приходилось держать в голове до следующей —
 * то есть ровно то, от чего инструмент должен избавлять.
 *
 * Направление переключателем, а не двумя формами: обещания ходят в обе
 * стороны, и разделять их на две панели значит удваивать интерфейс ради
 * одного логического поля.
 */
const DUE_CHIPS = [
  { label: 'сегодня', days: 0 },
  { label: '+3 дня', days: 3 },
  { label: '+нед', days: 7 },
  { label: '+2 нед', days: 14 },
] as const;

export function CommitmentQuickAdd({ personId }: { personId: number }) {
  const create = useCreateCommitment();

  const [direction, setDirection] = useState<'i_owe' | 'they_owe'>('i_owe');
  const [title, setTitle] = useState('');
  const [dueDays, setDueDays] = useState<number | null>(7);

  const submit = () => {
    const text = title.trim();
    if (!text) return;
    create.mutate(
      {
        personId,
        direction,
        title: text,
        dueAt: dueDays === null ? null : addDays(today(), dueDays),
      },
      { onSuccess: () => setTitle('') },
    );
  };

  return (
    <div className="mb-3 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="mb-2 flex items-center gap-1">
        {(
          [
            ['i_owe', 'я обещал'],
            ['they_owe', 'он обещал'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setDirection(value)}
            className={`rounded-md px-2.5 py-1 text-[12.5px] transition-colors ${
              direction === value
                ? 'bg-raised text-fg'
                : 'text-fg-faint hover:text-fg-dim'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={
            direction === 'i_owe' ? 'Что я пообещал' : 'Что он пообещал'
          }
        />
        <Button variant="ghost" onClick={submit} disabled={create.isPending}>
          добавить
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="eyebrow mr-1">срок</span>
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
        <button
          type="button"
          onClick={() => setDueDays(null)}
          className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
            dueDays === null
              ? 'border-fg-faint text-fg'
              : 'border-line text-fg-faint hover:text-fg-dim'
          }`}
          // Без срока обещание не всплывёт просроченным — иногда это честнее,
          // чем выдумывать дату, которой не договаривались.
          title="Без срока — напоминания не будет"
        >
          без срока
        </button>
      </div>
    </div>
  );
}
