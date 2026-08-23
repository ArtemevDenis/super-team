import { useState } from 'react';

import { daysWord, formatDay, plural } from '../dates';
import type { KarmaEntryType, KarmaSummaryType } from '../types';

const entriesWord = (count: number) => plural(count, 'запись', 'записи', 'записей');

/**
 * Показываются обе цифры — за окно и за всё время.
 *
 * Только «всего» — метрика мёртвая: старожил всегда наверху просто потому,
 * что дольше работает. Только «за 90 дней» — теряется масштаб человека.
 * Взвешенного балла здесь нет намеренно: он выглядит точнее, чем есть,
 * а карма отвечает «выходит ли за рамки», а не «на сколько баллов».
 */
export function KarmaSummary({
  summary,
  records = [],
}: {
  summary: KarmaSummaryType;
  /** Записи с описаниями — цифры без них ничего не объясняют. */
  records?: KarmaEntryType[];
}) {
  const { inWindow, total, windowDays, byCategory, daysSinceLast } = summary;
  const [expanded, setExpanded] = useState(false);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-4 text-[13px] leading-relaxed text-fg-faint">
        Ни одной отметки за всё время. Это говорит о том, что ты не замечал
        хорошее, а не о том, что его не было.
      </p>
    );
  }

  const max = Math.max(...byCategory.map((c) => c.count), 1);

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tnum text-2xl font-semibold text-positive">{inWindow}</span>
        <span className="text-[13px] text-fg-dim">
          {entriesWord(inWindow)} за {windowDays} дней
        </span>
        <span className="tnum ml-auto text-[12px] text-fg-faint">
          {total} за всё время
        </span>
      </div>

      {byCategory.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {byCategory.map((item) => (
            <li key={item.category} className="flex items-center gap-2.5">
              <span className="w-40 shrink-0 truncate text-[12.5px] text-fg-dim">
                {item.category}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
                <span
                  className="block h-full rounded-full bg-positive/70"
                  style={{ width: `${(item.count / max) * 100}%` }}
                />
              </span>
              <span className="tnum w-5 shrink-0 text-right text-[12px] text-fg-faint">
                {item.count}
              </span>
            </li>
          ))}
        </ul>
      )}

      {daysSinceLast !== null && (
        <p
          className={`mt-3 text-[12px] ${
            daysSinceLast > 90 ? 'text-warning' : 'text-fg-faint'
          }`}
        >
          {daysSinceLast === 0
            ? 'Последняя отметка сегодня'
            : `Последняя отметка ${daysSinceLast} ${daysWord(daysSinceLast)} назад`}
        </p>
      )}

      {records.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[12px] text-fg-faint underline decoration-dotted hover:text-fg-dim"
            aria-expanded={expanded}
          >
            {expanded ? 'свернуть' : `за что именно — все ${records.length}`}
          </button>

          {expanded && (
            <ul className="mt-2.5 space-y-2.5 border-t border-line-soft pt-2.5">
              {records.map((record) => (
                <li key={record.id} className="text-[13px] leading-snug">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="eyebrow text-positive">{record.category}</span>
                    <span className="tnum text-[11px] text-fg-faint">
                      {formatDay(record.happenedAt)}
                    </span>
                  </div>
                  {/* Ради этой строки карма и ведётся: на перформанс-ревью
                      нужна не цифра, а «вот за что, вот когда». */}
                  <p className="mt-0.5 text-fg-dim">{record.description}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Компактный вариант для карточки в списке команды. */
export function KarmaBadge({ summary }: { summary: KarmaSummaryType }) {
  if (summary.total === 0) {
    return <span className="tnum text-[11px] text-fg-faint">карма 0</span>;
  }

  return (
    <span className="tnum text-[11px] text-fg-faint">
      карма{' '}
      <span className={summary.inWindow > 0 ? 'text-positive' : 'text-fg-faint'}>
        {summary.inWindow}
      </span>
      <span className="text-fg-faint">/{summary.total}</span>
    </span>
  );
}
