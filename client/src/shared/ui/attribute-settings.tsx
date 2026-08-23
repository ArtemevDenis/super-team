import { useState } from 'react';

import {
  useCreateAttribute,
  useDeleteAttribute,
  usePeople,
  useReference,
  useReorderAttributes,
  useUpdateAttribute,
} from '../api';
import { Button, Empty, Field, Select, TextInput } from './primitives';
import type { AttributeSettingType } from '../types';

const AXIS_LABEL: Record<string, string> = {
  skill: 'может',
  will: 'хочет',
  neutral: 'нейтральный',
};

const AXIS_TONE: Record<string, string> = {
  skill: 'text-info',
  will: 'text-positive',
  neutral: 'text-fg-faint',
};

/**
 * Настройка атрибутов.
 *
 * Самое опасное действие здесь — добавить общий атрибут: по правилу
 * холодного старта OVR не считается, пока оценён не весь набор, и у всей
 * команды он мгновенно станет `??`. Это верное поведение, но выглядит как
 * поломка, поэтому предупреждение стоит до кнопки, а не после.
 */
export function AttributeSettings({
  attributes,
}: {
  attributes: AttributeSettingType[];
}) {
  const { data: reference } = useReference();
  const { data: people } = usePeople();

  const core = attributes.filter((a) => a.kind === 'core');
  const skills = attributes.filter((a) => a.kind === 'skill');

  return (
    <div className="space-y-8">
      <section>
        <h3 className="eyebrow mb-2">Общие — из них считается общий уровень</h3>
        <p className="mb-3 text-[12.5px] leading-relaxed text-fg-faint">
          Оси нужны для матрицы «может × хочет». Если все атрибуты повесить на
          одну ось, вторая останется пустой и матрица перестанет что-либо
          различать.
        </p>

        {core.length > 0 ? (
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {core.map((attribute, index) => (
              <AttributeRow
                key={attribute.id}
                attribute={attribute}
                canMoveUp={index > 0}
                canMoveDown={index < core.length - 1}
                siblings={core}
              />
            ))}
          </ul>
        ) : (
          <Empty>Ни одного общего атрибута — общий уровень не считается.</Empty>
        )}

        <AddAttribute kind="core" peopleCount={people?.length ?? 0} />
      </section>

      <section>
        <h3 className="eyebrow mb-2">Компетенции по специализациям</h3>
        <p className="mb-3 text-[12.5px] leading-relaxed text-fg-faint">
          Показываются только тем, у кого эта специализация, и в общий уровень
          не входят — иначе человек с двенадцатью оценёнными скиллами обгонял
          бы того, у кого их четыре.
        </p>

        {(reference?.specializations ?? []).map((specialization) => {
          const group = skills.filter(
            (a) => a.specializationId === specialization.id,
          );
          return (
            <div key={specialization.id} className="mb-4">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="text-[13px] font-medium">{specialization.name}</span>
                <span className="tnum text-[11px] text-fg-faint">{group.length}</span>
              </div>

              {group.length > 0 ? (
                <ul className="divide-y divide-line-soft rounded-lg border border-line">
                  {group.map((attribute, index) => (
                    <AttributeRow
                      key={attribute.id}
                      attribute={attribute}
                      canMoveUp={index > 0}
                      canMoveDown={index < group.length - 1}
                      siblings={group}
                    />
                  ))}
                </ul>
              ) : (
                <Empty>Компетенций нет.</Empty>
              )}

              <AddAttribute
                kind="skill"
                specializationId={specialization.id}
                peopleCount={0}
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}

function AttributeRow({
  attribute,
  canMoveUp,
  canMoveDown,
  siblings,
}: {
  attribute: AttributeSettingType;
  canMoveUp: boolean;
  canMoveDown: boolean;
  siblings: AttributeSettingType[];
}) {
  const update = useUpdateAttribute();
  const remove = useDeleteAttribute();
  const reorder = useReorderAttributes();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState(attribute.name);
  const [shortCode, setShortCode] = useState(attribute.shortCode);
  const [axis, setAxis] = useState(attribute.axis);
  const [description, setDescription] = useState(attribute.description ?? '');

  const move = (direction: -1 | 1) => {
    const index = siblings.findIndex((s) => s.id === attribute.id);
    const next = [...siblings];
    const [moved] = next.splice(index, 1);
    next.splice(index + direction, 0, moved!);
    reorder.mutate({ ids: next.map((s) => s.id) });
  };

  if (editing) {
    return (
      <li className="space-y-2 px-3.5 py-3">
        <div className="grid gap-2 lg:grid-cols-[1fr_5rem_9rem]">
          <Field label="Название">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Код" hint="на карточке">
            <TextInput
              value={shortCode}
              maxLength={4}
              onChange={(e) => setShortCode(e.target.value)}
            />
          </Field>
          {attribute.kind === 'core' && (
            <Field label="Ось">
              <Select
                value={axis}
                onChange={(e) => setAxis(e.target.value as typeof axis)}
              >
                <option value="skill">может</option>
                <option value="will">хочет</option>
                <option value="neutral">нейтральный</option>
              </Select>
            </Field>
          )}
        </div>

        <Field label="Что означает «3»" hint="Без этого оценки уплывают год к году">
          <TextInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="3 — уверенно решает типовые задачи без помощи"
          />
        </Field>

        <div className="flex items-center gap-2">
          <Button
            variant="solid"
            onClick={() =>
              update.mutate(
                {
                  id: attribute.id,
                  name: name.trim(),
                  shortCode: shortCode.trim(),
                  axis,
                  description: description.trim() || null,
                },
                { onSuccess: () => setEditing(false) },
              )
            }
            disabled={update.isPending || !name.trim() || shortCode.trim().length < 2}
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
    <li className="px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="eyebrow shrink-0">{attribute.shortCode}</span>
        <span
          className={`text-[13.5px] ${
            attribute.isActive ? '' : 'text-fg-faint line-through'
          }`}
        >
          {attribute.name}
        </span>
        {attribute.kind === 'core' && (
          <span className={`text-[11px] ${AXIS_TONE[attribute.axis]}`}>
            {AXIS_LABEL[attribute.axis]}
          </span>
        )}
        {!attribute.isActive && <span className="eyebrow">скрыт</span>}
        {attribute.usage.assessments > 0 && (
          <span className="tnum text-[11px] text-fg-faint">
            {attribute.usage.assessments} оценок · {attribute.usage.people} чел.
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {confirmDelete ? (
            <>
              <span className="text-[11px] text-fg-faint">
                {attribute.usage.assessments > 0 ? 'будет скрыт' : 'удалить?'}
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  remove.mutate(attribute.id, {
                    onSuccess: (result) => {
                      setConfirmDelete(false);
                      setNotice(
                        result.deleted
                          ? null
                          : `Не удалён — за ним ${result.usage?.assessments} оценок. Скрыт: выпал из расчётов, история осталась.`,
                      );
                    },
                  })
                }
              >
                да
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                нет
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={() => move(-1)}
                className="px-1 text-[12px] text-fg-faint hover:text-fg disabled:opacity-25"
                title="выше"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={() => move(1)}
                className="px-1 text-[12px] text-fg-faint hover:text-fg disabled:opacity-25"
                title="ниже"
              >
                ↓
              </button>
              <Button variant="quiet" onClick={() => setEditing(true)}>
                изменить
              </Button>
              <Button
                variant="quiet"
                onClick={() =>
                  update.mutate({ id: attribute.id, isActive: !attribute.isActive })
                }
              >
                {attribute.isActive ? 'скрыть' : 'вернуть'}
              </Button>
              {attribute.isActive && (
                <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
                  удалить
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {attribute.description && (
        <p className="mt-0.5 text-[11.5px] text-fg-faint">{attribute.description}</p>
      )}
      {notice && <p className="mt-1 text-[11.5px] text-warning">{notice}</p>}
    </li>
  );
}

function AddAttribute({
  kind,
  specializationId,
  peopleCount,
}: {
  kind: 'core' | 'skill';
  specializationId?: number;
  peopleCount: number;
}) {
  const create = useCreateAttribute();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [axis, setAxis] = useState<'skill' | 'will' | 'neutral'>('skill');
  const [description, setDescription] = useState('');

  if (!open) {
    return (
      <Button className="mt-2" onClick={() => setOpen(true)}>
        {kind === 'core' ? 'добавить общий атрибут' : 'добавить компетенцию'}
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface p-3">
      {kind === 'core' && peopleCount > 0 && (
        /* Последствие неочевидное и мгновенное: без предупреждения лид решит,
           что приложение сломалось. */
        <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-[12.5px] leading-relaxed text-warning">
          Общий уровень не считается, пока оценён весь набор. Новый атрибут
          сразу превратит OVR в «??» у всех {peopleCount} человек — до тех пор,
          пока ты его каждому не поставишь.
        </p>
      )}

      <div className="grid gap-2 lg:grid-cols-[1fr_5rem_9rem]">
        <Field label="Название">
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'core' ? 'Например, Надёжность' : 'Например, Kotlin'}
          />
        </Field>
        <Field label="Код">
          <TextInput
            value={shortCode}
            maxLength={4}
            onChange={(e) => setShortCode(e.target.value)}
            placeholder="НАД"
          />
        </Field>
        {kind === 'core' && (
          <Field label="Ось">
            <Select
              value={axis}
              onChange={(e) => setAxis(e.target.value as typeof axis)}
            >
              <option value="skill">может</option>
              <option value="will">хочет</option>
              <option value="neutral">нейтральный</option>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Что означает «3»">
        <TextInput
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Опиши середину шкалы"
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button
          variant="solid"
          disabled={
            create.isPending || !name.trim() || shortCode.trim().length < 2
          }
          onClick={() =>
            create.mutate(
              {
                name: name.trim(),
                shortCode: shortCode.trim(),
                kind,
                specializationId: specializationId ?? null,
                axis: kind === 'core' ? axis : 'skill',
                description: description.trim() || null,
              },
              {
                onSuccess: () => {
                  setName('');
                  setShortCode('');
                  setDescription('');
                  setOpen(false);
                },
              },
            )
          }
        >
          добавить
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          отмена
        </Button>
      </div>
    </div>
  );
}
