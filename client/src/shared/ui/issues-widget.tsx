import { useState } from 'react';

import { useAddIssue, useIssues, useRemoveIssue, useUpdateIssue } from '../api';
import { formatDay, today } from '../dates';
import type { IssueSummaryType, IssueViewType } from '../types';
import { Button, TextInput } from './primitives';

/**
 * Косяки — записи о том, что пошло не так.
 *
 * Разделены на две части зеркально карме: действие в главной колонке,
 * запись в боковой. Логика та же — то, что требует твоего участия, должно
 * быть на виду, а история не должна занимать главное место.
 *
 * Отличие от кармы одно, и оно определяет весь раздел: у записи есть
 * разговор. Пока его не было, запись висит наверху и напоминает о себе
 * сигналом на панели; после — уходит в историю. Список стремится
 * опуститься до нуля, а не расти: накопительный перечень чужих провалов
 * превращает инструмент в досье и соблазняет предъявить всё разом на
 * ревью, а это худший разговор из возможных.
 *
 * Без категорий и без тяжести намеренно: любая классификация породила бы
 * статистику, а статистика зовёт сравнивать людей между собой.
 *
 * Удаление есть у каждой записи и это не мелочь: после разбора выясняется,
 * что косяка не было или он чужой — и тогда запись должна исчезнуть
 * начисто, а не висеть перечёркнутой.
 */
export function IssuesQuickAdd({
  personId,
  /** Внутри Panel свой заголовок не нужен — он был бы вторым подряд. */
  hideTitle = false,
  /**
   * Список непроговорённых рядом с вводом.
   *
   * На странице человека он не нужен — там всё видно в боковой сводке, и
   * дублировать значит показывать одно и то же дважды на одном экране.
   * А перед встречей нужен: именно там их отмечают проговорёнными.
   */
  showOpen = true,
}: {
  personId: number;
  hideTitle?: boolean;
  showOpen?: boolean;
}) {
  const { data } = useIssues(personId);
  const add = useAddIssue(personId);
  const [text, setText] = useState('');

  // Пока данные не пришли — не рисуем ничего. В режиме показа косяки
  // намеренно НЕ прячутся: это факт о событии, а не догадка о человеке.
  if (!data) return null;

  const submit = () => {
    const description = text.trim();
    if (!description) return;
    add.mutate({ description }, { onSuccess: () => setText('') });
  };

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      {!hideTitle && <p className="eyebrow mb-2">Записать косяк</p>}

      <div className="flex gap-1.5">
        <TextInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Что пошло не так"
        />
        <Button variant="ghost" onClick={submit} disabled={add.isPending}>
          записать
        </Button>
      </div>

      {showOpen && data.open.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-line pt-2.5">
          {data.open.map((issue) => (
            <IssueRow key={issue.id} issue={issue} personId={personId} />
          ))}
        </ul>
      )}

      {data.total === 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-fg-faint">
          Пусто. Записывай, пока помнишь подробности, а не общее ощущение.
        </p>
      )}

      {showOpen && data.total > 0 && data.open.length === 0 && (
        <p className="mt-2 text-[12px] text-fg-faint">Всё записанное проговорено.</p>
      )}
    </div>
  );
}

/**
 * Показ без ввода — для экрана подготовки к встрече.
 *
 * Записывать косяк здесь нельзя намеренно: подготовка отвечает на вопрос
 * «о чём говорить», а не «что зафиксировать». Появись тут поле ввода — и
 * экран перед встречей превратился бы в место, где в раздражении дописывают
 * пункты, вместо того чтобы смотреть на уже собранное.
 *
 * Красный кружок — не проговорено, о нём и предстоит разговор. Зелёный с
 * зачёркнутым текстом — вопрос закрыт: видно, что тема была и к ней
 * возвращаться не нужно.
 *
 * Асимметрия по давности намеренная. Проговорённые сужены до «закрыли с
 * прошлой встречи» — как хорошее в соседней колонке: что закрыто раньше,
 * уже обсуждалось и только шумело бы. А непроговорённые показываются все,
 * сколько бы им ни было времени: косяк трёхмесячной давности, о котором
 * так и не поговорили, — это ровно то, что не должно потеряться, и
 * отфильтруй его по последней встрече, весь смысл раздела исчезнет.
 */
export function IssuesDigest({
  personId,
  since,
}: {
  personId: number;
  /** День прошлой встречи. Без него проговорённые не показываются вовсе. */
  since: string | null;
}) {
  const { data } = useIssues(personId);
  if (!data) return null;

  const closedSince = since
    ? data.recent.filter((i) => i.discussedAt !== null && i.discussedAt >= since)
    : [];
  const items = [...data.open, ...closedSince];
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-fg-faint">
        {data.total === 0 ? 'Записей нет.' : 'Всё проговорено.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2 rounded-lg border border-line bg-surface px-4 py-3">
      {items.map((issue) => (
        <li key={issue.id} className="flex items-baseline gap-2 text-[13px]">
          <span
            className={`mt-1.5 size-2 shrink-0 rounded-full ${
              issue.isDiscussed ? 'bg-positive' : 'bg-critical'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span
              className={
                issue.isDiscussed
                  ? 'text-fg-faint line-through decoration-fg-faint'
                  : 'text-fg-dim'
              }
            >
              {issue.description}
            </span>
            <span className="tnum ml-2 text-[11px] text-fg-faint">
              {formatDay(issue.happenedAt)}
            </span>
            {issue.isOverdue && (
              <span className="ml-2 text-[11px] text-warning">
                {issue.ageDays} дн. без разговора
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Боковая сводка: история и счётчики, без ввода. */
export function IssuesSummary({
  personId,
  summary,
}: {
  personId: number;
  summary: IssueSummaryType;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? summary.recent : summary.recent.slice(0, 3);

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[13px] text-fg-dim">
        <span className="tnum text-[22px] font-semibold text-fg">
          {summary.total}
        </span>{' '}
        {summary.total === 1 ? 'запись' : summary.total < 5 ? 'записи' : 'записей'}
        {summary.open.length > 0 && (
          <span className="ml-2 text-[12px] text-warning">
            {summary.open.length} без разговора
          </span>
        )}
      </p>

      {summary.open.length > 0 && (
        <>
          <p className="eyebrow mb-1.5 mt-3">Без разговора</p>
          <ul className="space-y-2">
            {summary.open.map((issue) => (
              <IssueRow key={issue.id} issue={issue} personId={personId} />
            ))}
          </ul>
        </>
      )}

      {summary.recent.length > 0 && (
        <>
          <p className="eyebrow mb-1.5 mt-3">Проговорено</p>
          <ul className="space-y-1.5">
            {shown.map((issue) => (
              <IssueRow key={issue.id} issue={issue} personId={personId} compact />
            ))}
          </ul>
          {summary.recent.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-[12px] text-fg-faint underline decoration-dotted hover:text-fg-dim"
            >
              {expanded ? 'свернуть' : `все ${summary.recent.length}`}
            </button>
          )}
        </>
      )}

      {summary.olderCount > 0 && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-fg-faint">
          Ещё {summary.olderCount} проговорено больше 90 дней назад — история
          сохранена, но с глаз убрана.
        </p>
      )}

      {summary.total === 0 && (
        <p className="mt-1.5 text-[12px] text-fg-faint">Записей пока нет.</p>
      )}
    </div>
  );
}

/**
 * Две строки, а не одна: описание сверху, дата и действия снизу.
 *
 * В одну строку это разваливалось в узкой колонке на экране подготовки —
 * «проговорили» повисало справа, а текст обтекал его снизу рваными
 * кусками. Двухстрочная раскладка одинаково читается и в боковой колонке,
 * и на телефоне.
 */
function IssueRow({
  issue,
  personId,
  compact = false,
}: {
  issue: IssueViewType;
  personId: number;
  compact?: boolean;
}) {
  const update = useUpdateIssue(personId);
  const remove = useRemoveIssue(personId);

  return (
    <li className="group">
      <div className="flex items-baseline gap-2">
        <span
          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
            issue.isOverdue
              ? 'bg-warning'
              : issue.isDiscussed
                ? 'bg-fg-faint'
                : 'bg-info'
          }`}
        />
        <span
          className={`min-w-0 flex-1 text-[13px] ${
            issue.isDiscussed ? 'text-fg-faint' : 'text-fg-dim'
          }`}
        >
          {issue.description}
        </span>
      </div>

      <div className="ml-3.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="tnum text-[11px] text-fg-faint">
          {formatDay(issue.happenedAt)}
        </span>
        {issue.isOverdue && !compact && (
          <span className="text-[11px] text-warning">
            {issue.ageDays} дн. без разговора
          </span>
        )}

        <span className="flex-1" />

        {!issue.isDiscussed ? (
          <button
            type="button"
            onClick={() => update.mutate({ id: issue.id, discussedAt: today() })}
            disabled={update.isPending}
            className="text-[11.5px] text-fg-faint underline decoration-dotted hover:text-positive"
          >
            проговорили
          </button>
        ) : (
          <button
            type="button"
            // Снять отметку, а не удалять: поставил не тому — и без этого
            // пришлось бы стирать сам факт.
            onClick={() => update.mutate({ id: issue.id, discussedAt: null })}
            disabled={update.isPending}
            className="text-[11px] text-fg-faint opacity-0 transition-opacity hover:text-fg-dim group-hover:opacity-100"
          >
            вернуть
          </button>
        )}

        <button
          type="button"
          onClick={() => remove.mutate(issue.id)}
          disabled={remove.isPending}
          className="text-[11px] text-fg-faint opacity-0 transition-opacity hover:text-critical group-hover:opacity-100"
          title="Удалить запись — например, если разобрались и косяк оказался чужим"
        >
          ✕
        </button>
      </div>
    </li>
  );
}
