import { useState } from 'react';

import {
  useAttributeSettings,
  useCreateKarmaCategory,
  useDeleteKarmaCategory,
  useKarmaCategories,
  useTeamKarma,
  useUpdateKarmaCategory,
} from '../shared/api';
import { AttributeSettings } from '../shared/ui/attribute-settings';
import { StructureSettings } from '../shared/ui/structure-settings';
import { GradeMatrix } from '../shared/ui/grade-matrix';
import { Button, Empty, Panel, TextInput } from '../shared/ui/primitives';
import type { KarmaCategoryType } from '../shared/types';

export function SettingsPage() {
  const { data: attributes } = useAttributeSettings();

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>

      <Panel title="Отделы и направления">
        <p className="mb-3 text-[13px] leading-relaxed text-fg-faint">
          Направление — единица, внутри которой люди подменяют друг друга:
          по нему считаются провалы в календаре отсутствий и к нему привязаны
          компетенции.
        </p>
        <StructureSettings />
      </Panel>

      <Panel title="Оценки">
        {attributes ? (
          <AttributeSettings attributes={attributes} />
        ) : (
          <p className="text-[13px] text-fg-faint">Загружаю…</p>
        )}
      </Panel>

      <Panel title="Ожидания по грейдам">
        <p className="mb-3 text-[13px] leading-relaxed text-fg-faint">
          Это и превращает карточку из оценки человека в инструмент роста:
          без ожиданий видно «сколько у него», с ними — «чего не хватает до
          следующего уровня».
        </p>
        {attributes && <GradeMatrix attributes={attributes} />}
      </Panel>

      <KarmaCategoriesSection />
    </div>
  );
}

function KarmaCategoriesSection() {
  const { data: categories } = useKarmaCategories(true);
  const { data: karma } = useTeamKarma();
  const create = useCreateKarmaCategory();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const usage = new Map<string, number>();
  for (const record of karma?.records ?? []) {
    usage.set(record.category, (usage.get(record.category) ?? 0) + 1);
  }

  const add = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim() }, { onSuccess: () => setName('') });
  };

  return (
    <Panel title="Категории кармы">
      <p className="mb-3 text-[13px] leading-relaxed text-fg-faint">
        Категория отвечает на вопрос «что это было». Весов у категорий нет
        намеренно: значение записи несёт её описание, а не коэффициент.
      </p>

      {categories && categories.length > 0 ? (
        <ul className="divide-y divide-line-soft rounded-lg border border-line">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              usedBy={usage.get(category.name) ?? 0}
              onNotice={setNotice}
            />
          ))}
        </ul>
      ) : (
        <Empty>Ни одной категории. Добавь первую.</Empty>
      )}

      {notice && <p className="mt-2 text-[12.5px] text-warning">{notice}</p>}

      <div className="mt-3 flex gap-2">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Новая категория — и Enter"
        />
        <Button variant="solid" onClick={add} disabled={create.isPending}>
          добавить
        </Button>
      </div>
    </Panel>
  );
}

function CategoryRow({
  category,
  usedBy,
  onNotice,
}: {
  category: KarmaCategoryType;
  usedBy: number;
  onNotice: (message: string | null) => void;
}) {
  const update = useUpdateKarmaCategory();
  const remove = useDeleteKarmaCategory();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  const rename = () => {
    const next = draft.trim();
    if (!next || next === category.name) {
      setEditing(false);
      return;
    }
    update.mutate(
      { id: category.id, name: next },
      {
        onSuccess: () => {
          setEditing(false);
          // Переименование переносит и прошлые записи — иначе история
          // осталась бы под именем, которого больше нет ни в одном списке.
          if (usedBy > 0) {
            onNotice(`Переименована — ${usedBy} прошлых записей обновлены.`);
          }
        },
      },
    );
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
      {editing ? (
        <TextInput
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename();
            if (e.key === 'Escape') {
              setDraft(category.name);
              setEditing(false);
            }
          }}
          onBlur={rename}
          className="max-w-56"
        />
      ) : (
        <span
          className={`text-[13.5px] ${
            category.isActive ? '' : 'text-fg-faint line-through'
          }`}
        >
          {category.name}
        </span>
      )}

      {usedBy > 0 && (
        <span className="tnum text-[11px] text-fg-faint">{usedBy} записей</span>
      )}
      {!category.isActive && <span className="eyebrow">скрыта</span>}

      <div className="ml-auto flex items-center gap-1">
        {!editing && (
          <Button variant="quiet" onClick={() => setEditing(true)}>
            переименовать
          </Button>
        )}
        <Button
          variant="quiet"
          onClick={() =>
            update.mutate({ id: category.id, isActive: !category.isActive })
          }
        >
          {category.isActive ? 'скрыть' : 'вернуть'}
        </Button>
        {category.isActive && (
          <Button
            variant="quiet"
            onClick={() =>
              remove.mutate(category.id, {
                onSuccess: (result) => {
                  onNotice(
                    result.deleted
                      ? null
                      : `Не удалена — под ней ${result.usedBy} записей, поэтому просто скрыта.`,
                  );
                },
              })
            }
          >
            удалить
          </Button>
        )}
      </div>
    </li>
  );
}
