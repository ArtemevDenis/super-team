import { useState } from 'react';

import { useCreateAbsence, useDeleteAbsence, useUpdateAbsence } from '../api';
import { daysBetween, daysWord, formatDay, today } from '../dates';
import { Button, Empty, Field, Select, TextInput } from './primitives';
import type { AbsenceType } from '../types';

const KINDS = ['отпуск', 'больничный', 'другое'] as const;

const KIND_TONE: Record<string, string> = {
  отпуск: 'text-info',
  больничный: 'text-critical',
  другое: 'text-fg-faint',
  отсутствие: 'text-fg-faint',
};

/**
 * Отсутствия можно не только заводить, но и править.
 *
 * Отпуск переносят, больничный оказывается короче, дату вводят с опечаткой.
 * Раньше запись становилась неисправимой, а она останавливает часы каденции —
 * то есть ошибка в дате тихо ломала все алерты по человеку.
 */
export function AbsencePanel({
  personId,
  absences,
}: {
  personId: number;
  absences: AbsenceType[];
}) {
  const [adding, setAdding] = useState(absences.length === 0);
  const [showPast, setShowPast] = useState(false);

  const day = today();
  const upcoming = absences.filter((a) => a.toDay >= day);
  const past = absences.filter((a) => a.toDay < day);

  return (
    <div className="space-y-2.5">
      {upcoming.length > 0 ? (
        <ul className="divide-y divide-line-soft rounded-lg border border-line">
          {upcoming.map((absence) => (
            <AbsenceRow key={absence.id} absence={absence} />
          ))}
        </ul>
      ) : (
        !adding && <Empty>Ничего не запланировано.</Empty>
      )}

      {past.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-[12px] text-fg-faint underline decoration-dotted hover:text-fg-dim"
          >
            {showPast ? 'скрыть прошедшие' : `прошедшие — ${past.length}`}
          </button>
          {showPast && (
            <ul className="divide-y divide-line-soft rounded-lg border border-line opacity-70">
              {past.map((absence) => (
                <AbsenceRow key={absence.id} absence={absence} />
              ))}
            </ul>
          )}
        </>
      )}

      {adding ? (
        <AddAbsence personId={personId} onDone={() => setAdding(false)} />
      ) : (
        <Button onClick={() => setAdding(true)}>добавить отсутствие</Button>
      )}
    </div>
  );
}

function AbsenceRow({ absence }: { absence: AbsenceType }) {
  const update = useUpdateAbsence();
  const remove = useDeleteAbsence();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [fromDay, setFromDay] = useState(absence.fromDay);
  const [toDay, setToDay] = useState(absence.toDay);
  const [kind, setKind] = useState(absence.kind);
  const [error, setError] = useState<string | null>(null);

  const length = daysBetween(absence.fromDay, absence.toDay) + 1;

  const save = () => {
    if (fromDay > toDay) {
      setError('Дата окончания раньше даты начала');
      return;
    }
    setError(null);
    update.mutate(
      { id: absence.id, fromDay, toDay, kind },
      {
        onSuccess: () => setEditing(false),
        onError: (e) => setError(e instanceof Error ? e.message : 'Не вышло'),
      },
    );
  };

  if (editing) {
    return (
      <li className="space-y-2 px-3.5 py-3">
        {/* Одна колонка, а не три: панель живёт в узкой боковой колонке,
            а брейкпоинт sm: смотрит на ширину экрана, не контейнера — на
            широком мониторе три колонки схлопывали поля дат до «18.08.». */}
        <div className="grid gap-2">
          <Field label="С">
            <TextInput
              type="date"
              value={fromDay}
              onChange={(e) => setFromDay(e.target.value)}
            />
          </Field>
          <Field label="По">
            <TextInput
              type="date"
              value={toDay}
              onChange={(e) => setToDay(e.target.value)}
            />
          </Field>
          <Field label="Что">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as AbsenceType['kind'])}
            >
              {KINDS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error && <p className="text-[12px] text-critical">{error}</p>}

        <div className="flex items-center gap-2">
          <Button variant="solid" onClick={save} disabled={update.isPending}>
            сохранить
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setFromDay(absence.fromDay);
              setToDay(absence.toDay);
              setKind(absence.kind);
              setError(null);
              setEditing(false);
            }}
          >
            отмена
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-3.5 py-2.5">
      <span className={`eyebrow shrink-0 ${KIND_TONE[absence.kind]}`}>
        {absence.kind}
      </span>
      <span className="tnum text-[13px]">
        {formatDay(absence.fromDay)} — {formatDay(absence.toDay)}
      </span>
      <span className="tnum text-[11px] text-fg-faint">
        {length} {daysWord(length)}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {confirmDelete ? (
          <>
            {/* Удаление меняет прошлое: часы каденции перестают стоять,
                и просрочки тех недель пересчитываются. */}
            <span className="text-[11px] text-fg-faint">каденция пересчитается</span>
            <Button variant="ghost" onClick={() => remove.mutate(absence.id)}>
              удалить
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
              нет
            </Button>
          </>
        ) : (
          <>
            <Button variant="quiet" onClick={() => setEditing(true)}>
              изменить
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
              удалить
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function AddAbsence({
  personId,
  onDone,
}: {
  personId: number;
  onDone: () => void;
}) {
  const create = useCreateAbsence();
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [kind, setKind] = useState<string>('отпуск');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) {
      setError('Дата окончания раньше даты начала');
      return;
    }
    setError(null);
    create.mutate(
      { personId, fromDay, toDay, kind },
      {
        onSuccess: () => {
          setFromDay('');
          setToDay('');
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <div className="grid gap-2">
        <Field label="С">
          <TextInput
            type="date"
            value={fromDay}
            onChange={(e) => setFromDay(e.target.value)}
          />
        </Field>
        <Field label="По">
          <TextInput
            type="date"
            value={toDay}
            onChange={(e) => setToDay(e.target.value)}
          />
        </Field>
        <Field label="Что">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error && <p className="text-[12px] text-critical">{error}</p>}

      <div className="flex items-center gap-2">
        <Button
          variant="solid"
          onClick={submit}
          disabled={create.isPending || !fromDay || !toDay}
        >
          добавить
        </Button>
        <Button variant="quiet" onClick={onDone}>
          отмена
        </Button>
        <span className="ml-auto text-[11px] text-fg-faint">
          На это время часы каденции останавливаются
        </span>
      </div>
    </div>
  );
}
