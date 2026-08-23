import { useEffect, useRef, useState } from 'react';

import { useCreateKarma, useKarmaCategories } from '../api';
import { addDays, formatDay, today } from '../dates';
import { TextInput } from './primitives';

const WHEN_CHIPS: { label: string; days: number }[] = [
  { label: 'сегодня', days: 0 },
  { label: 'вчера', days: -1 },
  { label: 'позавчера', days: -2 },
  { label: 'на прошлой неделе', days: -7 },
];

/**
 * Отметить хорошее можно откуда угодно, а не только из формы 1-1: мысль
 * «а он ведь молодец» приходит не на встрече, а между делом, и если её
 * некуда деть сразу — она не доживает до следующего 1-1.
 */
export function KarmaQuickAdd({
  personId,
  personName,
}: {
  personId: number;
  personName?: string;
}) {
  const create = useCreateKarma();
  const { data: categories } = useKarmaCategories();
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [whenDays, setWhenDays] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (category) inputRef.current?.focus();
  }, [category]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  const submit = () => {
    if (!category || !description.trim()) return;

    create.mutate(
      {
        personId,
        category,
        description: description.trim(),
        happenedAt: addDays(today(), whenDays),
      },
      {
        onSuccess: () => {
          // Подтверждение обязательно: лента обновляется далеко от места
          // ввода, и без явного отклика непонятно, записалось ли вообще.
          setSaved(
            whenDays === 0
              ? `Отмечено${personName ? `: ${personName}` : ''}`
              : `Отмечено задним числом — ${formatDay(addDays(today(), whenDays))}`,
          );
          setCategory(null);
          setDescription('');
          setWhenDays(0);
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="eyebrow shrink-0">Отметить хорошее</span>
        <div className="flex flex-wrap gap-1.5">
          {(categories ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(category === item.name ? null : item.name)}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                category === item.name
                  ? 'border-positive bg-positive/10 text-positive'
                  : 'border-line text-fg-faint hover:border-fg-faint hover:text-fg-dim'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
        {saved && !category && (
          <span className="ml-auto text-[12px] text-positive">✓ {saved}</span>
        )}
      </div>

      {category && (
        <div className="mt-3 space-y-2">
          <TextInput
            ref={inputRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') setCategory(null);
            }}
            placeholder="За что именно — и Enter"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow mr-1">когда</span>
            {WHEN_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => setWhenDays(chip.days)}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                  whenDays === chip.days
                    ? 'border-fg-faint text-fg'
                    : 'border-line text-fg-faint hover:text-fg-dim'
                }`}
              >
                {chip.label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-fg-faint">
              Esc — отменить
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
