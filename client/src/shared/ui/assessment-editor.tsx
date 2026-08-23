import { useState } from 'react';

import { useSaveAssessment } from '../api';
import { daysWord, formatDay } from '../dates';
import { Button, TextInput } from './primitives';
import type { PersonCardType, ScoredAttributeType } from '../types';

/**
 * Оценки как снимки, а не как правка поля.
 *
 * Каждое сохранение добавляет запись с датой и обоснованием, а не заменяет
 * число. Ради истории всё и затевалось: на перформанс-ревью нужен не текущий
 * балл, а «было 3, стало 4, вот когда и вот почему».
 */
export function AssessmentEditor({ card }: { card: PersonCardType }) {
  const groups: { title: string; items: ScoredAttributeType[]; muted?: boolean }[] = [
    { title: 'Основные', items: card.core },
    { title: card.specializationName ?? 'Специализация', items: card.skills },
    { title: 'Прошлый опыт — вне общего уровня', items: card.pastExperience, muted: true },
  ].filter((group) => group.items.length > 0);

  const rated = [...card.core, ...card.skills].filter((a) => a.value !== null);
  const assuming = rated.filter((a) => a.confidence === 'assuming');

  return (
    <div className="space-y-5">
      {assuming.length > 0 && (
        /**
         * Сводка вынесена наверх намеренно. Много «предполагаю» у одного
         * человека — это факт про тебя, а не про него: значит ты мало видишь
         * его работу. Внизу мелким шрифтом этот сигнал не читается.
         */
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
          <p className="text-[13px] leading-relaxed text-warning">
            <span className="tnum font-semibold">
              {assuming.length} из {rated.length}
            </span>{' '}
            {assuming.length === 1 ? 'оценки — предположение' : 'оценок — предположения'}
            {assuming.length >= rated.length / 2 && (
              <span className="text-warning/80">
                {' '}
                — это про то, как мало ты видишь его работу, а не про него
              </span>
            )}
          </p>
          <p className="mt-1 text-[12px] text-fg-faint">
            {assuming.map((a) => a.name).join(' · ')} — стоит проверить на
            ближайшем 1-1
          </p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="eyebrow mb-2">{group.title}</h3>
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {group.items.map((attribute) => (
              <AttributeRow
                key={attribute.attributeId}
                personId={card.personId}
                attribute={attribute}
                muted={group.muted}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AttributeRow({
  personId,
  attribute,
  muted,
}: {
  personId: number;
  attribute: ScoredAttributeType;
  muted?: boolean;
}) {
  const save = useSaveAssessment();
  const [pending, setPending] = useState<number | null>(null);
  const [evidence, setEvidence] = useState('');
  const [assuming, setAssuming] = useState(attribute.confidence === 'assuming');

  const submit = (value: number) => {
    save.mutate(
      {
        personId,
        attributeId: attribute.attributeId,
        value,
        confidence: assuming ? 'assuming' : 'sure',
        evidence: evidence.trim() || null,
      },
      {
        onSuccess: () => {
          setPending(null);
          setEvidence('');
        },
      },
    );
  };

  const isOpen = pending !== null;
  const isAssumption = attribute.confidence === 'assuming';
  const belowExpectation =
    attribute.expected !== null &&
    attribute.value !== null &&
    attribute.value < attribute.expected;

  return (
    <li className={`px-3.5 py-2.5 ${muted ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1">
          <span className="text-[13.5px]">{attribute.name}</span>
          {isAssumption && (
            <span className="ml-2 rounded-full border border-warning/50 px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-warning">
              предположение
            </span>
          )}
          {attribute.expected !== null && (
            <span
              className={`tnum ml-2 text-[11px] ${
                belowExpectation ? 'text-critical' : 'text-fg-faint'
              }`}
            >
              ожидание {attribute.expected}
            </span>
          )}
          {attribute.description && (
            <span className="mt-0.5 block text-[11.5px] text-fg-faint">
              {attribute.description}
            </span>
          )}
        </span>

        <div className="flex shrink-0 gap-1">
          {[1, 2, 3, 4, 5].map((score) => {
            const isCurrent = attribute.value === score;
            return (
              <button
                key={score}
                type="button"
                onClick={() => setPending(pending === score ? null : score)}
                className={`tnum size-7 rounded text-[12.5px] transition-colors ${
                  isCurrent
                    ? // Предположение — пустая кнопка с пунктиром, знание —
                      // залитая. Разницу видно, не читая подписей.
                      isAssumption
                      ? 'border border-dashed border-warning bg-transparent text-warning'
                      : 'bg-fg text-ink'
                    : pending === score
                      ? 'bg-info/30 text-fg'
                      : 'bg-line-soft text-fg-faint hover:bg-line hover:text-fg-dim'
                }`}
              >
                {score}
              </button>
            );
          })}
        </div>
      </div>

      {attribute.assessedAt && !isOpen && (
        <p className="mt-1 text-[11px] text-fg-faint">
          {formatDay(attribute.assessedAt)}
          {attribute.reliability.isStale &&
            ` · устарело на ${attribute.reliability.ageDays} ${daysWord(attribute.reliability.ageDays ?? 0)}`}
          {attribute.evidence && ` · ${attribute.evidence}`}
        </p>
      )}


      {isOpen && (
        <div className="mt-2 space-y-2 rounded-md border border-line bg-raised p-2.5">
          <TextInput
            autoFocus
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(pending);
              if (e.key === 'Escape') setPending(null);
            }}
            placeholder={`Почему ${pending} — одной строкой`}
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* Уверенность — не украшение: много «предполагаю» у человека
                означает, что у тебя мало контакта с ним, а не что он такой. */}
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-fg-faint">
              <input
                type="checkbox"
                checked={assuming}
                onChange={(e) => setAssuming(e.target.checked)}
                className="accent-warning"
              />
              это предположение, а не знание
            </label>
            <div className="ml-auto flex gap-1.5">
              <Button variant="quiet" onClick={() => setPending(null)}>
                отмена
              </Button>
              <Button variant="solid" onClick={() => submit(pending)} disabled={save.isPending}>
                поставить {pending}
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
