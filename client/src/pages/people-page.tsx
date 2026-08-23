import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  useCalendar,
  useCreatePerson,
  usePeople,
  useReference,
  useTeamCards,
  useTeamClimate,
  useTeamKarma,
} from '../shared/api';
import { plural } from '../shared/dates';
import { AbsenceCalendar } from '../shared/ui/absence-calendar';
import { PeersSection } from '../shared/ui/peers-section';
import { KarmaBadge } from '../shared/ui/karma-summary';
import { PlayerCard } from '../shared/ui/player-card';
import { TeamClimate } from '../shared/ui/team-climate';
import {
  Button,
  Empty,
  Field,
  Panel,
  Select,
  TextInput,
} from '../shared/ui/primitives';
import type { PersonType, TeamKarmaType } from '../shared/types';

export function PeoplePage() {
  const { data: people, isLoading } = usePeople();
  const { data: reference } = useReference();
  const { data: karma } = useTeamKarma();
  const { data: cards } = useTeamCards();
  const { data: climate } = useTeamClimate();
  const { data: calendar } = useCalendar();
  const [adding, setAdding] = useState(false);

  if (isLoading) return <p className="text-[13px] text-fg-faint">Загружаю…</p>;
  if (!people || !reference) return null;

  const karmaByPerson = new Map(
    (karma?.rows ?? []).map((row) => [row.personId, row.summary]),
  );
  const cardByPerson = new Map((cards ?? []).map((card) => [card.personId, card]));

  // Группировка по отделам — та самая «расстановка по линиям»: перекос
  // состава (пять разработчиков и один тестировщик) виден сразу.
  const members = people.filter((p) => p.kind !== 'peer');
  const peers = people.filter((p) => p.kind === 'peer');

  const byDepartment = new Map<string, PersonType[]>();
  for (const person of members) {
    const key = person.departmentName ?? 'Без отдела';
    byDepartment.set(key, [...(byDepartment.get(key) ?? []), person]);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Команда
          <span className="tnum ml-3 text-[15px] font-normal text-fg-faint">
            {members.length}
          </span>
        </h1>
        <Button variant="solid" onClick={() => setAdding((v) => !v)}>
          {adding ? 'свернуть' : 'добавить человека'}
        </Button>
      </div>

      {adding && (
        <AddPersonForm reference={reference} onDone={() => setAdding(false)} />
      )}

      {members.length === 0 && !adding && (
        <Empty>
          Пока никого нет. Добавь первого человека, чтобы начать вести встречи.
        </Empty>
      )}

      {climate && (
        <Panel title="Настрой команды">
          <TeamClimate climate={climate} />
        </Panel>
      )}

      {calendar && (
        <Panel title="Отсутствия на три месяца вперёд">
          <AbsenceCalendar calendar={calendar} />
        </Panel>
      )}

      {karma && <KarmaSelfAudit karma={karma} />}

      {/* Порядок остаётся по отделам, а не по карме: сортировка по ней
          превратила бы инструмент помощи в турнирную таблицу. */}
      {[...byDepartment.entries()].map(([department, members]) => (
        <Panel key={department} title={department} count={members.length}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((person) => {
              const card = cardByPerson.get(person.id);
              return (
                <li key={person.id}>
                  {card ? (
                    <PlayerCard card={card} />
                  ) : (
                    <Link
                      to={`/person/${person.id}`}
                      className="block rounded-xl border border-line bg-surface px-4 py-3"
                    >
                      <span className="text-[14.5px] font-medium">
                        {person.fullName}
                      </span>
                    </Link>
                  )}
                  <div className="mt-1 flex items-baseline justify-between gap-2 px-1">
                    <span className="tnum text-[11px] text-fg-faint">
                      1-1 раз в {person.cadenceDays} дн.
                    </span>
                    {karmaByPerson.has(person.id) && (
                      <KarmaBadge summary={karmaByPerson.get(person.id)!} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}

      <PeersSection peers={peers} />
    </div>
  );
}

/**
 * Сводка сформулирована про лида, а не про команду. Карма — единственное
 * место, где фиксируется хорошее, и пустота здесь означает, что её не
 * замечали, а не что её не было.
 */
function KarmaSelfAudit({ karma }: { karma: TeamKarmaType }) {
  const { givenInWindow, peopleTouched, neverMarked, windowDays } = karma;

  return (
    <section className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="eyebrow">за {windowDays} дней ты отметил</span>
        <span className="tnum text-[15px] font-semibold text-positive">
          {givenInWindow}
        </span>
        <span className="text-[13px] text-fg-dim">
          {plural(givenInWindow, 'раз', 'раза', 'раз')} · {peopleTouched} из{' '}
          {karma.rows.length} человек
        </span>
      </div>

      {neverMarked.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-fg-faint">
          Ни разу не отмечал:{' '}
          {neverMarked.map((person, index) => (
            <span key={person.personId}>
              {index > 0 && ', '}
              <Link
                to={`/person/${person.personId}`}
                className="text-fg-dim hover:text-fg hover:underline"
              >
                {person.personName}
              </Link>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function AddPersonForm({
  reference,
  onDone,
}: {
  reference: NonNullable<ReturnType<typeof useReference>['data']>;
  onDone: () => void;
}) {
  const create = useCreatePerson();
  const [fullName, setFullName] = useState('');
  const [specializationId, setSpecializationId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [hiredAt, setHiredAt] = useState('');
  const [cadenceDays, setCadenceDays] = useState('14');

  const submit = () => {
    if (!fullName.trim()) return;
    create.mutate(
      {
        fullName: fullName.trim(),
        specializationId: specializationId ? Number(specializationId) : null,
        gradeId: gradeId ? Number(gradeId) : null,
        hiredAt: hiredAt || null,
        cadenceDays: Number(cadenceDays) || 14,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Имя">
        <TextInput
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Имя и фамилия"
        />
      </Field>
      <Field label="Специализация">
        <Select
          value={specializationId}
          onChange={(e) => setSpecializationId(e.target.value)}
        >
          <option value="">—</option>
          {reference.specializations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Грейд">
        <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
          <option value="">—</option>
          {reference.grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="В команде с">
        <TextInput
          type="date"
          value={hiredAt}
          onChange={(e) => setHiredAt(e.target.value)}
        />
      </Field>
      <Field label="1-1 раз в, дней" hint="Новичку 7, стабильному сеньору 21">
        <div className="flex gap-2">
          <TextInput
            type="number"
            min={1}
            value={cadenceDays}
            onChange={(e) => setCadenceDays(e.target.value)}
          />
          <Button variant="solid" onClick={submit} disabled={create.isPending}>
            добавить
          </Button>
        </div>
      </Field>
    </div>
  );
}
