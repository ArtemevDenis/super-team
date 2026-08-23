import { useState } from 'react';

import {
  useCreateDepartment,
  useCreateSpecialization,
  useDeleteDepartment,
  useDeleteSpecialization,
  useReferenceFull,
  useUpdateDepartment,
  useUpdateSpecialization,
} from '../api';
import { Button, Empty, Field, Select, TextInput } from './primitives';
import type { DepartmentSettingType, SpecializationSettingType } from '../types';

const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#64748b'];

/**
 * Отделы и направления внутри них.
 *
 * Ничего здесь не удаляется по-настоящему, если за записью что-то стоит:
 * от специализации каскадом идут её компетенции, а от них — снимки оценок.
 * Одно удаление молча уничтожило бы всю историю оценок по направлению.
 */
export function StructureSettings() {
  const { data: reference } = useReferenceFull();
  const [notice, setNotice] = useState<string | null>(null);

  if (!reference) return null;

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-[12.5px] text-warning">
          {notice}
        </p>
      )}

      {reference.departments.length === 0 ? (
        <Empty>Ни одного отдела. Без них специализации некуда положить.</Empty>
      ) : (
        <ul className="space-y-3">
          {reference.departments.map((department) => (
            <DepartmentBlock
              key={department.id}
              department={department}
              specializations={reference.specializations.filter(
                (s) => s.departmentId === department.id,
              )}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}

      <AddDepartment />
    </div>
  );
}

function DepartmentBlock({
  department,
  specializations,
  onNotice,
}: {
  department: DepartmentSettingType;
  specializations: SpecializationSettingType[];
  onNotice: (message: string | null) => void;
}) {
  const update = useUpdateDepartment();
  const remove = useDeleteDepartment();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(department.name);
  const [color, setColor] = useState(department.color);

  return (
    <li className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3.5 py-2.5">
        {editing ? (
          <>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-56"
            />
            <div className="flex gap-1">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  style={{ backgroundColor: option }}
                  className={`size-5 rounded-full transition-transform ${
                    color === option ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''
                  }`}
                />
              ))}
            </div>
            <div className="ml-auto flex gap-1.5">
              <Button
                variant="solid"
                onClick={() =>
                  update.mutate(
                    { id: department.id, name: name.trim(), color },
                    { onSuccess: () => setEditing(false) },
                  )
                }
                disabled={!name.trim()}
              >
                сохранить
              </Button>
              <Button variant="quiet" onClick={() => setEditing(false)}>
                отмена
              </Button>
            </div>
          </>
        ) : (
          <>
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: department.color }}
            />
            <span
              className={`text-[14px] font-medium ${
                department.isActive ? '' : 'text-fg-faint line-through'
              }`}
            >
              {department.name}
            </span>
            {!department.isActive && <span className="eyebrow">скрыт</span>}
            <span className="tnum text-[11px] text-fg-faint">
              {specializations.length} напр. · {department.usage.people} чел.
            </span>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="quiet" onClick={() => setEditing(true)}>
                изменить
              </Button>
              <Button
                variant="quiet"
                onClick={() =>
                  update.mutate({
                    id: department.id,
                    isActive: !department.isActive,
                  })
                }
              >
                {department.isActive ? 'скрыть' : 'вернуть'}
              </Button>
              <Button
                variant="quiet"
                onClick={() =>
                  remove.mutate(department.id, {
                    onSuccess: (result) =>
                      onNotice(
                        result.deleted
                          ? null
                          : `«${department.name}» не удалён — внутри ${result.usage?.specializations} направлений. Скрыт.`,
                      ),
                  })
                }
              >
                удалить
              </Button>
            </div>
          </>
        )}
      </div>

      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {specializations.map((specialization) => (
          <SpecializationRow
            key={specialization.id}
            specialization={specialization}
            onNotice={onNotice}
          />
        ))}
      </ul>

      <div className="px-3.5 py-2.5">
        <AddSpecialization departmentId={department.id} />
      </div>
    </li>
  );
}

function SpecializationRow({
  specialization,
  onNotice,
}: {
  specialization: SpecializationSettingType;
  onNotice: (message: string | null) => void;
}) {
  const { data: reference } = useReferenceFull();
  const update = useUpdateSpecialization();
  const remove = useDeleteSpecialization();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(specialization.name);
  const [departmentId, setDepartmentId] = useState(
    String(specialization.departmentId),
  );

  const { usage } = specialization;

  if (editing) {
    return (
      <li className="space-y-2 px-3.5 py-2.5">
        <div className="grid gap-2 lg:grid-cols-2">
          <Field label="Название">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Отдел">
            <Select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              {(reference?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            variant="solid"
            onClick={() =>
              update.mutate(
                {
                  id: specialization.id,
                  name: name.trim(),
                  departmentId: Number(departmentId),
                },
                { onSuccess: () => setEditing(false) },
              )
            }
            disabled={!name.trim()}
          >
            сохранить
          </Button>
          <Button variant="quiet" onClick={() => setEditing(false)}>
            отмена
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2">
      <span
        className={`text-[13px] ${
          specialization.isActive ? 'text-fg-dim' : 'text-fg-faint line-through'
        }`}
      >
        {specialization.name}
      </span>
      {!specialization.isActive && <span className="eyebrow">скрыто</span>}
      <span className="tnum text-[11px] text-fg-faint">
        {usage.people} чел. · {usage.attributes} компетенций · {usage.assessments}{' '}
        оценок
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="quiet" onClick={() => setEditing(true)}>
          изменить
        </Button>
        <Button
          variant="quiet"
          onClick={() =>
            update.mutate({
              id: specialization.id,
              isActive: !specialization.isActive,
            })
          }
        >
          {specialization.isActive ? 'скрыть' : 'вернуть'}
        </Button>
        <Button
          variant="quiet"
          onClick={() =>
            remove.mutate(specialization.id, {
              onSuccess: (result) =>
                onNotice(
                  result.deleted
                    ? null
                    : `«${specialization.name}» не удалено — за ним ${result.usage?.assessments} оценок и ${result.usage?.people} человек. Скрыто: удаление уничтожило бы историю оценок по этому направлению.`,
                ),
            })
          }
        >
          удалить
        </Button>
      </div>
    </li>
  );
}

function AddDepartment() {
  const create = useCreateDepartment();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line px-3.5 py-3">
      <Field label="Новый отдел">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) =>
            e.key === 'Enter' &&
            name.trim() &&
            create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') })
          }
          placeholder="Например, Аналитика"
          className="max-w-56"
        />
      </Field>
      <div className="flex gap-1 pb-1.5">
        {COLORS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setColor(option)}
            style={{ backgroundColor: option }}
            className={`size-5 rounded-full ${
              color === option ? 'ring-2 ring-fg ring-offset-2 ring-offset-ink' : ''
            }`}
          />
        ))}
      </div>
      <Button
        variant="solid"
        disabled={!name.trim() || create.isPending}
        onClick={() =>
          create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') })
        }
      >
        добавить
      </Button>
    </div>
  );
}

function AddSpecialization({ departmentId }: { departmentId: number }) {
  const create = useCreateSpecialization();
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), departmentId },
      { onSuccess: () => setName('') },
    );
  };

  return (
    <div className="flex gap-2">
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Новое направление — и Enter"
        className="max-w-64"
      />
      <Button onClick={submit} disabled={!name.trim() || create.isPending}>
        добавить
      </Button>
    </div>
  );
}
