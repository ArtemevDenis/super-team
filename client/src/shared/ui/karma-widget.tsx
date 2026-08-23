import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useCreateKarma, useKarmaCategories, useTeamKarma } from '../api';
import { addDays, formatDay, formatRelative, plural, today } from '../dates';
import { Empty, Select, TextInput } from './primitives';
import type { PersonType } from '../types';

const WHEN_CHIPS: { label: string; days: number }[] = [
  { label: 'сегодня', days: 0 },
  { label: 'вчера', days: -1 },
  { label: 'позавчера', days: -2 },
  { label: 'на прошлой неделе', days: -7 },
];

/**
 * Виджет кармы на панели лида.
 *
 * Две задачи сразу: отметить любого, не уходя с главного экрана — мысль
 * «а он ведь молодец» приходит между делом и до карточки человека не
 * доживает; и прочитать, за что именно карма была дана. Второе важнее:
 * в общей ленте истории описания тонут среди встреч и обязательств, а
 * именно они — всё содержание кармы.
 */
export function KarmaWidget({ people }: { people: PersonType[] }) {
  const { data: karma } = useTeamKarma();
  const { data: categories } = useKarmaCategories();
  const create = useCreateKarma();

  const [personId, setPersonId] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [whenDays, setWhenDays] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (category) inputRef.current?.focus();
  }, [category]);

  const records = useMemo(() => {
    const all = karma?.records ?? [];
    return filter ? all.filter((r) => r.category === filter) : all;
  }, [karma, filter]);

  const canSubmit = Boolean(personId && category && description.trim());

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      {
        personId: Number(personId),
        category: category!,
        description: description.trim(),
        happenedAt: addDays(today(), whenDays),
      },
      {
        onSuccess: () => {
          setCategory(null);
          setDescription('');
          setWhenDays(0);
        },
      },
    );
  };

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="w-auto min-w-44"
            aria-label="Кого отметить"
          >
            <option value="">кого отметить…</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName}
              </option>
            ))}
          </Select>

          <div className="flex flex-wrap gap-1.5">
            {(categories ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!personId}
                onClick={() => setCategory(category === item.name ? null : item.name)}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-35 ${
                  category === item.name
                    ? 'border-positive bg-positive/10 text-positive'
                    : 'border-line text-fg-faint hover:border-fg-faint hover:text-fg-dim'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
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
            </div>
          </div>
        )}
      </div>

      {karma && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
            <span className="text-[12.5px] text-fg-dim">
              за {karma.windowDays} дней ты отметил{' '}
              <span className="tnum text-positive">{karma.givenInWindow}</span>{' '}
              {plural(karma.givenInWindow, 'раз', 'раза', 'раз')} ·{' '}
              {karma.peopleTouched} из {karma.rows.length} человек
            </span>
          </div>

          {karma.categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              <FilterChip active={filter === null} onClick={() => setFilter(null)}>
                все
              </FilterChip>
              {karma.categories.map((name) => (
                <FilterChip
                  key={name}
                  active={filter === name}
                  onClick={() => setFilter(filter === name ? null : name)}
                >
                  {name}
                </FilterChip>
              ))}
            </div>
          )}

          {records.length > 0 ? (
            <ul className="divide-y divide-line-soft rounded-lg border border-line">
              {records.map((record) => (
                <li key={record.id} className="px-3.5 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      to={`/person/${record.personId}`}
                      className="text-[13.5px] font-medium hover:underline"
                    >
                      {record.personName}
                    </Link>
                    <span className="eyebrow text-positive">{record.category}</span>
                    <span
                      className="tnum ml-auto text-[11px] text-fg-faint"
                      title={formatDay(record.happenedAt)}
                    >
                      {formatRelative(record.happenedAt)}
                    </span>
                  </div>
                  {/* Ради этой строки карма и ведётся: через полгода на
                      перформанс-ревью нужна не цифра, а «вот за что». */}
                  <p className="mt-0.5 text-[13px] leading-snug text-fg-dim">
                    {record.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              {filter
                ? `За ${karma.windowDays} дней ничего по этой категории.`
                : 'Пока пусто. Отметь первого — это про то, что ты замечаешь, а не про отчётность.'}
            </Empty>
          )}

          {karma.neverMarked.length > 0 && (
            <p className="px-1 text-[12px] leading-relaxed text-fg-faint">
              Ни разу не отмечал:{' '}
              {karma.neverMarked.map((person, index) => (
                <span key={person.personId}>
                  {index > 0 && ', '}
                  <button
                    type="button"
                    onClick={() => setPersonId(String(person.personId))}
                    className="text-fg-dim underline decoration-dotted hover:text-fg"
                  >
                    {person.personName}
                  </button>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors ${
        active
          ? 'border-fg-faint text-fg'
          : 'border-line text-fg-faint hover:text-fg-dim'
      }`}
    >
      {children}
    </button>
  );
}
