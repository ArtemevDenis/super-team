import { useState } from 'react';

import { useArchivePerson, useReference, useUpdatePerson } from '../api';
import { Button, Field, Select, TextInput } from './primitives';
import type { PersonType } from '../types';

/**
 * Смена грейда и специализации — не правка поля, а событие карьеры.
 *
 * Сервер пишет их в журнал с датой и названиями, поэтому здесь есть поле
 * комментария: через год «Middle → Senior» без причины читается хуже, чем
 * «Middle → Senior · промо по итогам ревью».
 */
export function PersonEditor({
  person,
  onDone,
}: {
  person: PersonType;
  onDone: () => void;
}) {
  const { data: reference } = useReference();
  const update = useUpdatePerson();
  const archive = useArchivePerson();

  const [fullName, setFullName] = useState(person.fullName);
  const [specializationId, setSpecializationId] = useState(
    person.specializationId ? String(person.specializationId) : '',
  );
  const [gradeId, setGradeId] = useState(
    person.gradeId ? String(person.gradeId) : '',
  );
  const [cadenceDays, setCadenceDays] = useState(String(person.cadenceDays));
  const [hiredAt, setHiredAt] = useState(person.hiredAt ?? '');
  const [probationEndsAt, setProbationEndsAt] = useState(
    person.probationEndsAt ?? '',
  );
  const [birthday, setBirthday] = useState(person.birthday ?? '');
  const [note, setNote] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (!reference) return null;

  const nextGradeId = gradeId ? Number(gradeId) : null;
  const nextSpecializationId = specializationId ? Number(specializationId) : null;
  const gradeChanged = nextGradeId !== person.gradeId;
  const specializationChanged = nextSpecializationId !== person.specializationId;
  const isCareerEvent = gradeChanged || specializationChanged;

  const submit = () => {
    if (!fullName.trim()) return;
    update.mutate(
      {
        id: person.id,
        fullName: fullName.trim(),
        specializationId: nextSpecializationId,
        gradeId: nextGradeId,
        cadenceDays: Number(cadenceDays) || 14,
        hiredAt: hiredAt || null,
        probationEndsAt: probationEndsAt || null,
        birthday: birthday || null,
        note: note.trim() || null,
      },
      { onSuccess: onDone },
    );
  };

  const currentGrade = reference.grades.find((g) => g.id === person.gradeId);
  const nextGrade = reference.grades.find((g) => g.id === nextGradeId);
  const currentSpec = reference.specializations.find(
    (s) => s.id === person.specializationId,
  );
  const nextSpec = reference.specializations.find(
    (s) => s.id === nextSpecializationId,
  );

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Имя">
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>

        <Field label="Специализация" hint="Отдел берётся из неё">
          <Select
            value={specializationId}
            onChange={(e) => setSpecializationId(e.target.value)}
          >
            <option value="">—</option>
            {reference.departments.map((department) => (
              <optgroup key={department.id} label={department.name}>
                {reference.specializations
                  .filter((s) => s.departmentId === department.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field label="Грейд">
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            <option value="">—</option>
            {reference.grades.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="1-1 раз в, дней" hint="Новичку 7, стабильному сеньору 21">
          <TextInput
            type="number"
            min={1}
            value={cadenceDays}
            onChange={(e) => setCadenceDays(e.target.value)}
          />
        </Field>

        <Field label="В команде с">
          <TextInput
            type="date"
            value={hiredAt}
            onChange={(e) => setHiredAt(e.target.value)}
          />
        </Field>

        <Field label="Испытательный до">
          <TextInput
            type="date"
            value={probationEndsAt}
            onChange={(e) => setProbationEndsAt(e.target.value)}
          />
        </Field>

        <Field label="День рождения">
          <TextInput
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </Field>
      </div>

      {isCareerEvent && (
        <div className="rounded-lg border border-info/40 bg-info/5 px-3.5 py-3">
          <p className="text-[13px] text-info">
            Это попадёт в историю человека:
            {gradeChanged && (
              <span className="ml-1 font-medium">
                {currentGrade?.name ?? 'без грейда'} → {nextGrade?.name ?? 'без грейда'}
              </span>
            )}
            {gradeChanged && specializationChanged && ' ·'}
            {specializationChanged && (
              <span className="ml-1 font-medium">
                {currentSpec?.name ?? 'без специализации'} →{' '}
                {nextSpec?.name ?? 'без специализации'}
              </span>
            )}
          </p>
          <div className="mt-2">
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Почему — например «промо по итогам ревью»"
            />
          </div>
          {specializationChanged && (
            <p className="mt-2 text-[11.5px] text-fg-faint">
              Оценки по прошлым скиллам не удалятся — уйдут в блок «прошлый
              опыт» и перестанут влиять на общий уровень.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="solid" onClick={submit} disabled={update.isPending}>
          сохранить
        </Button>
        <Button onClick={onDone}>отмена</Button>

        <div className="ml-auto flex items-center gap-2">
          {confirmArchive ? (
            <>
              <span className="text-[12px] text-fg-faint">
                Убрать из команды? История сохранится.
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  archive.mutate({ id: person.id }, { onSuccess: onDone })
                }
              >
                да, убрать
              </Button>
              <Button variant="quiet" onClick={() => setConfirmArchive(false)}>
                нет
              </Button>
            </>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmArchive(true)}>
              человек ушёл из команды
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
