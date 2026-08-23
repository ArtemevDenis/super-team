import { Link, useParams } from 'react-router-dom';

import { useNoteBlockSpecs, usePersonContext } from '../shared/api';
import { daysWord, formatRelative } from '../shared/dates';
import { Empty, Panel } from '../shared/ui/primitives';
import { ClimateTrend } from '../shared/ui/climate-trend';
import { IssuesDigest } from '../shared/ui/issues-widget';
import type { CommitmentType, NoteBlockType } from '../shared/types';

/**
 * Обратная сторона формы ввода. Оба экрана отвечают на один вопрос — «о чём
 * мы договаривались в прошлый раз» — просто один до встречи, другой после.
 */
export function PrepPage() {
  const { id } = useParams();
  const personId = Number(id);
  const { data: context, isLoading } = usePersonContext(personId);

  if (isLoading || !context) {
    return <p className="text-[13px] text-fg-faint">Загружаю…</p>;
  }

  const { person, cadence, lastMeeting, openCommitments, karmaSinceLastMeeting } =
    context;

  return (
    <div className="mx-auto max-w-2xl space-y-9">
      <header>
        <Link to={`/person/${personId}`} className="eyebrow hover:text-fg-dim">
          ← {person.fullName}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Перед встречей
        </h1>
        <p className="mt-1 text-[13px] text-fg-faint">
          {cadence.lastDoneAt
            ? `Виделись ${cadence.daysSinceLast} ${daysWord(cadence.daysSinceLast ?? 0)} назад`
            : 'Ещё ни разу не встречались'}
          {context.nextPlanned?.plannedAt &&
            ` · запланировано ${formatRelative(context.nextPlanned.plannedAt)}`}
        </p>
      </header>

      {context.suggestedAgenda.length > 0 && (
        <Panel title="Повестка из незакрытого">
          <ul className="space-y-1.5 rounded-lg border border-line bg-surface px-4 py-3">
            {context.suggestedAgenda.map((item, index) => (
              <li key={index} className="flex items-baseline gap-2 text-[13.5px]">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-faint" />
                {item.text}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Читаемая сводка, а не редактор: перед встречей нужно вспомнить,
          что человеком движет, а не заполнять поля. */}
      <NoteBlocksDigest blocks={context.noteBlocks} personId={personId} />

      {lastMeeting?.notes && (
        <Panel title="Заметки с прошлой встречи">
          <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-fg-dim">
            {lastMeeting.notes}
          </p>
        </Panel>
      )}

      {/* Косяки блоком, а не только строкой в повестке: перед встречей их
          надо не просто увидеть, но и отметить проговорёнными сразу после —
          иначе отметка откладывается на «потом» и не ставится никогда. */}
      <div className="grid gap-8 sm:grid-cols-2">
        <CommitmentList
          title="Я обещал"
          tone="text-critical"
          items={openCommitments.iOwe}
          empty="Ничего не должен."
        />
        <CommitmentList
          title="Он обещал"
          tone="text-fg-faint"
          items={openCommitments.theyOwe}
          empty="Ничего не ждём."
        />
      </div>

      {/* Косяки и карма в две колонки под обещаниями — тем же приёмом, что
          «я обещал» / «он обещал». Перед встречей смотрят на обе стороны
          сразу: что хорошего было и что предстоит разобрать. */}
      <div className="grid gap-8 sm:grid-cols-2">
        <Panel title="Косяки">
          <IssuesDigest personId={personId} since={lastMeeting?.happenedAt ?? null} />
        </Panel>

        <Panel title="Хорошее с прошлой встречи" count={karmaSinceLastMeeting.length}>
          {karmaSinceLastMeeting.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border border-line bg-surface px-4 py-3">
              {karmaSinceLastMeeting.map((entry) => (
                <li key={entry.id} className="text-[13px]">
                  <span className="eyebrow text-positive">{entry.category}</span>
                  <span className="ml-2 text-fg-dim">{entry.description}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>С прошлой встречи ничего не отмечал.</Empty>
          )}
        </Panel>
      </div>

      {context.recentCheckins.length > 1 && (
        <Panel title="Как менялся настрой">
          <ClimateTrend checkins={context.recentCheckins} />
        </Panel>
      )}

      <Link
        to={`/person/${personId}/one-on-one`}
        className="inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-0 bg-fg px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-white"
      >
        записать встречу
      </Link>
    </div>
  );
}

function NoteBlocksDigest({
  blocks,
  personId,
}: {
  blocks: NoteBlockType[];
  personId: number;
}) {
  const { data: specs } = useNoteBlockSpecs();
  const filled = (specs ?? []).filter((spec) => {
    const block = blocks.find((b) => b.kind === spec.kind);
    return block && (block.content || block.value);
  });

  if (filled.length === 0) {
    return (
      <Panel title="Что я о нём знаю">
        <Empty>
          Ничего не записано. Цель, мотиваторы и риск ухода заполняются{' '}
          <Link to={`/person/${personId}`} className="underline hover:text-fg-dim">
            на карточке
          </Link>{' '}
          — перед встречей их полезно перечитать.
        </Empty>
      </Panel>
    );
  }

  return (
    <Panel title="Что я о нём знаю">
      <dl className="space-y-2.5 rounded-lg border border-line bg-surface px-4 py-3">
        {filled.map((spec) => {
          const block = blocks.find((b) => b.kind === spec.kind)!;
          return (
            <div key={spec.kind} className="flex flex-wrap gap-x-3 gap-y-0.5">
              {/*
                На телефоне подпись становится над значением: колонка в 144px
                съедала почти половину экрана, и текст заметки жался в узкую
                полосу — а в дороге читают именно его.
              */}
              <dt className="eyebrow w-full shrink-0 pt-0.5 sm:w-36">{spec.title}</dt>
              <dd className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-fg-dim">
                {block.value && (
                  <span
                    className={`mr-2 font-medium ${
                      block.value === 'высокий'
                        ? 'text-critical'
                        : block.value === 'средний'
                          ? 'text-warning'
                          : 'text-fg-dim'
                    }`}
                  >
                    {block.value}
                  </span>
                )}
                {block.content}
                {block.staleness.isDue && (
                  <span className="ml-2 text-[11px] text-warning">
                    пора пересмотреть
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}

function CommitmentList({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: string;
  items: CommitmentType[];
  empty: string;
}) {
  return (
    <Panel title={title} count={items.length}>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-[13.5px] leading-snug">
              <span className={`mr-2 inline-block size-1.5 rounded-full ${tone.replace('text-', 'bg-')}`} />
              {item.title}
              {item.dueAt && (
                <span className="tnum ml-2 text-[12px] text-fg-faint">
                  {formatRelative(item.dueAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Panel>
  );
}
