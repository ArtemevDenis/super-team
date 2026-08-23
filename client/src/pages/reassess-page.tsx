import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useBulkAssess, usePersonCard } from '../shared/api';
import { daysWord, formatDay } from '../shared/dates';
import { Button, Empty, TextInput } from '../shared/ui/primitives';
import type { ScoredAttributeType } from '../shared/types';

type DecisionType =
  | { kind: 'untouched' }
  | { kind: 'confirmed' }
  | { kind: 'changed'; value: number };

/**
 * Проходка по всем атрибутам разом.
 *
 * Нужна после смены грейда: оценки ставились под старую планку, и их надо
 * перечитать. Но не пересчитать автоматически — шкала атрибутов абсолютная,
 * «четвёрка» означает одно и то же у джуна и у сеньора, а относительность
 * живёт в ожиданиях грейда. Автоматический пересчёт подделал бы историю
 * снимками, которых лид не ставил.
 */
export function ReassessPage() {
  const { id } = useParams();
  const personId = Number(id);
  const navigate = useNavigate();
  const { data: card, isLoading } = usePersonCard(personId);
  const save = useBulkAssess();

  const [decisions, setDecisions] = useState<Record<number, DecisionType>>({});
  const [evidence, setEvidence] = useState<Record<number, string>>({});
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (isLoading || !card) {
    return <p className="text-[13px] text-fg-faint">Загружаю…</p>;
  }

  const attributes = [...card.core, ...card.skills];
  const rated = attributes.filter((a) => a.value !== null);

  const decisionFor = (attributeId: number): DecisionType =>
    decisions[attributeId] ?? { kind: 'untouched' };

  const touched = attributes.filter(
    (a) => decisionFor(a.attributeId).kind !== 'untouched',
  );

  /**
   * Автопереход — клавиатурная механика, и только клавиатурная.
   *
   * После клика мышью фокус уезжал на следующую строку, и набранное там
   * обоснование попадало в её обработчик цифр: фраза «вырос на 2 уровня»
   * молча выставляла соседнему атрибуту двойку. Мышью следующий шаг —
   * дописать обоснование, а не перейти дальше.
   */
  const decide = (
    index: number,
    attributeId: number,
    decision: DecisionType,
    source: 'keyboard' | 'mouse',
  ) => {
    setDecisions((prev) => ({ ...prev, [attributeId]: decision }));
    if (source === 'keyboard') rowRefs.current[index + 1]?.focus();
  };

  const submit = () => {
    const items = touched.map((attribute) => {
      const decision = decisionFor(attribute.attributeId);
      return {
        attributeId: attribute.attributeId,
        value:
          decision.kind === 'changed' ? decision.value : (attribute.value ?? 3),
        confidence: 'sure' as const,
        evidence: evidence[attribute.attributeId]?.trim() || null,
      };
    });

    if (items.length === 0) return;

    save.mutate(
      { personId, items },
      {
        onSuccess: () =>
          navigate(`/person/${personId}`, {
            state: { toast: `Переоценено: ${items.length}` },
          }),
      },
    );
  };

  if (attributes.length === 0) {
    return <Empty>У этого человека нет применимых атрибутов.</Empty>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <header>
        <Link to={`/person/${personId}`} className="eyebrow hover:text-fg-dim">
          ← {card.fullName}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Переоценка</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-fg-faint">
          Планка — {card.gradeName ?? 'без грейда'}. Значения абсолютные: они не
          пересчитываются при смене грейда, меняется только то, чего от человека
          ждут. Цифрами 1–5 ставится новая оценка, Enter подтверждает прежнюю.
        </p>
      </header>

      <ul className="divide-y divide-line-soft rounded-lg border border-line">
        {attributes.map((attribute, index) => (
          <ReassessRow
            key={attribute.attributeId}
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            attribute={attribute}
            decision={decisionFor(attribute.attributeId)}
            evidence={evidence[attribute.attributeId] ?? ''}
            onEvidence={(text) =>
              setEvidence((prev) => ({ ...prev, [attribute.attributeId]: text }))
            }
            onDecide={(decision, source) =>
              decide(index, attribute.attributeId, decision, source)
            }
          />
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <span className="tnum text-[12px] text-fg-faint">
            Пересмотрено {touched.length} из {attributes.length}
            {rated.length < attributes.length &&
              ` · ${attributes.length - rated.length} ещё ни разу не оценивали`}
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate(-1)}>отмена</Button>
            <Button
              variant="solid"
              onClick={submit}
              disabled={touched.length === 0 || save.isPending}
            >
              {save.isPending
                ? 'сохраняю…'
                : `сохранить ${touched.length || ''}`.trim()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ReassessRow = ({
  ref,
  attribute,
  decision,
  evidence,
  onEvidence,
  onDecide,
}: {
  ref: (node: HTMLDivElement | null) => void;
  attribute: ScoredAttributeType;
  decision: DecisionType;
  evidence: string;
  onEvidence: (text: string) => void;
  onDecide: (decision: DecisionType, source: 'keyboard' | 'mouse') => void;
}) => {
  const evidenceRef = useRef<HTMLInputElement>(null);
  const current = attribute.value;
  const shown = decision.kind === 'changed' ? decision.value : current;
  const belowExpectation =
    attribute.expected !== null && shown !== null && shown < attribute.expected;

  return (
    <li
      className={`px-4 py-3 ${
        decision.kind === 'untouched' ? '' : 'bg-raised/40'
      }`}
    >
      <div
        ref={ref}
        tabIndex={0}
        className="rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-info"
        onKeyDown={(event) => {
          const digit = Number(event.key);
          if (digit >= 1 && digit <= 5) {
            event.preventDefault();
            onDecide({ kind: 'changed', value: digit }, 'keyboard');
            return;
          }
          if (event.key === 'Enter' && current !== null) {
            event.preventDefault();
            onDecide({ kind: 'confirmed' }, 'keyboard');
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px]">{attribute.name}</span>
              {attribute.expected !== null && (
                <span
                  className={`tnum text-[11.5px] ${
                    belowExpectation ? 'text-critical' : 'text-fg-faint'
                  }`}
                >
                  планка {attribute.expected}
                </span>
              )}
              {decision.kind === 'confirmed' && (
                <span className="text-[11px] text-positive">подтверждено</span>
              )}
              {decision.kind === 'changed' && current !== null && (
                <span className="tnum text-[11px] text-info">
                  {current} → {decision.value}
                </span>
              )}
            </div>

            {attribute.description && (
              <p className="mt-0.5 text-[11.5px] text-fg-faint">
                {attribute.description}
              </p>
            )}

            <p className="tnum mt-0.5 text-[11px] text-fg-faint">
              {current === null
                ? 'ещё не оценивали'
                : `сейчас ${current}${
                    attribute.assessedAt ? ` · ${formatDay(attribute.assessedAt)}` : ''
                  }${
                    attribute.reliability.isStale
                      ? ` · устарело на ${attribute.reliability.ageDays} ${daysWord(attribute.reliability.ageDays ?? 0)}`
                      : ''
                  }`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => {
                  onDecide({ kind: 'changed', value: score }, 'mouse');
                  // Мышью следующий шаг — дописать, за что именно.
                  requestAnimationFrame(() => evidenceRef.current?.focus());
                }}
                className={`tnum size-8 rounded text-[13px] transition-colors ${
                  shown === score
                    ? decision.kind === 'changed'
                      ? 'bg-info text-ink'
                      : 'bg-fg text-ink'
                    : 'bg-line-soft text-fg-faint hover:bg-line hover:text-fg-dim'
                }`}
              >
                {score}
              </button>
            ))}

            {/* Подтверждение без изменения — тоже пересмотр. Иначе снять
                пометку об устаревании можно было бы только соврав. */}
            {current !== null && (
              <Button
                variant={decision.kind === 'confirmed' ? 'solid' : 'ghost'}
                onClick={() => onDecide({ kind: 'confirmed' }, 'mouse')}
                className="ml-1"
              >
                так же
              </Button>
            )}
          </div>
        </div>
      </div>

      {decision.kind !== 'untouched' && (
        <div className="mt-2">
          <TextInput
            ref={evidenceRef}
            value={evidence}
            onChange={(e) => onEvidence(e.target.value)}
            placeholder="За что именно — через полгода это объяснит оценку"
          />
        </div>
      )}
    </li>
  );
};
