import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  useIssues,
  usePersonCard,
  usePersonContext,
  usePersonTimeline,
  useUpdateCommitment,
} from '../shared/api';
import { AssessmentEditor } from '../shared/ui/assessment-editor';
import { PlayerCard } from '../shared/ui/player-card';
import {
  daysBetween,
  daysWord,
  formatDay,
  formatRelative,
  today,
} from '../shared/dates';
import { CommitmentQuickAdd } from '../shared/ui/commitment-quick-add';
import { IssuesQuickAdd, IssuesSummary } from '../shared/ui/issues-widget';
import { ClimateTrend } from '../shared/ui/climate-trend';
import { ContactBar } from '../shared/ui/contact-bar';
import { KarmaQuickAdd } from '../shared/ui/karma-quick-add';
import { KarmaSummary } from '../shared/ui/karma-summary';
import { NoteBlocks } from '../shared/ui/note-blocks';
import { PersonEditor } from '../shared/ui/person-editor';
import { AbsencePanel } from '../shared/ui/absence-panel';
import { PhotoUpload } from '../shared/ui/photo-upload';
import { Button, CollapsiblePanel, Empty, Panel } from '../shared/ui/primitives';

type TimelineItemType = {
  at: string;
  kind: 'meeting' | 'karma' | 'commitment' | 'event' | 'absence';
  title: string;
  detail?: string | null;
  tone?: string;
};

/** Порция истории за раз. */
const HISTORY_STEP = 20;

export function PersonPage() {
  const { id } = useParams();
  const personId = Number(id);
  const { data: context } = usePersonContext(personId);
  const { data: timeline } = usePersonTimeline(personId);
  const { data: card } = usePersonCard(personId);
  const { data: issues } = useIssues(personId);
  const [editing, setEditing] = useState(false);
  // История грузится порциями: у старожила это сотни строк, и вываливать
  // их разом значит подвесить страницу ради того, что смотрят изредка.
  const [historyLimit, setHistoryLimit] = useState(HISTORY_STEP);

  /**
   * Смена грейда за последний месяц, после которой ни одной оценки не
   * ставилось. Напоминание, а не автоматика: пересчитывать значения за лида
   * означало бы вписать в историю снимки, которых он не делал.
   */
  const gradeChangedRecently = (() => {
    const change = timeline?.events.find((e) => e.kind === 'grade_change');
    if (!change || !card) return null;

    const daysSince = daysBetween(change.at, today());
    if (daysSince > 30) return null;

    const reassessed = [...card.core, ...card.skills].some(
      (a) => a.assessedAt !== null && a.assessedAt >= change.at,
    );
    return reassessed ? null : change;
  })();

  if (!context || !timeline) {
    return <p className="text-[13px] text-fg-faint">Загружаю…</p>;
  }

  const { person, cadence, openCommitments } = context;
  const isPeer = person.kind === 'peer';

  // Единая лента: встречи, карма, обязательства и события карьеры вперемешку
  // по времени. Именно так историю отношений с человеком и вспоминают —
  // не по таблицам, а по порядку событий.
  const items: TimelineItemType[] = [
    ...timeline.oneOnOnes
      .filter((m) => m.happenedAt)
      .map((m) => ({
        at: m.happenedAt!,
        kind: 'meeting' as const,
        title: m.status === 'skipped' ? 'Встреча пропущена' : 'Встреча 1-1',
        detail: m.notes,
        tone: m.status === 'skipped' ? 'text-warning' : 'text-fg-dim',
      })),
    ...timeline.karma.map((k) => ({
      at: k.happenedAt,
      kind: 'karma' as const,
      title: k.category,
      detail: k.description,
      tone: 'text-positive',
    })),
    ...timeline.commitments
      .filter((c) => c.completedAt)
      .map((c) => ({
        at: c.completedAt!,
        kind: 'commitment' as const,
        title: c.direction === 'i_owe' ? 'Я выполнил обещание' : 'Он выполнил обещание',
        detail: c.title,
        tone: 'text-fg-faint',
      })),
    ...timeline.events.map((e) => {
      // Без «из чего во что» запись «Смена грейда» бесполезна — именно
      // ради этой пары журнал и ведётся.
      const transition =
        e.fromValue || e.toValue
          ? `${e.fromValue ?? '—'} → ${e.toValue ?? '—'}`
          : null;

      const title =
        e.kind === 'hired'
          ? 'Вышел в команду'
          : e.kind === 'grade_change'
            ? `Грейд: ${transition ?? 'изменён'}`
            : e.kind === 'specialization_change'
              ? `Специализация: ${transition ?? 'изменена'}`
              : e.kind === 'left'
                ? 'Ушёл из команды'
                : e.kind === 'returned'
                  ? 'Вернулся'
                  : e.kind;

      return {
        at: e.at,
        kind: 'event' as const,
        title,
        detail: e.note,
        tone: 'text-info',
      };
    }),
    ...timeline.absences.map((a) => ({
      at: a.fromDay,
      kind: 'absence' as const,
      title: a.kind,
      detail: `по ${formatDay(a.toDay)}`,
      tone: 'text-fg-faint',
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-9">
        {/*
          Карточка рядом с шапкой, а не в глубине страницы.
          Это первое, на что смотрят, открывая человека: уровень и провалы
          по атрибутам задают тон всему остальному. Раньше до неё надо было
          прокрутить мимо кармы и косяков.

          На узком экране уезжает под сведения: имя и кнопки важнее — с
          телефона заходят договориться о встрече, а не разглядывать оценки.
        */}
        <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
          <div className="mb-3">
            <PhotoUpload
              personId={personId}
              fullName={person.fullName}
              photoPath={person.photoPath}
              size={72}
            />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {person.fullName}
            </h1>
            {isPeer ? (
              <>
                <span className="eyebrow text-info">смежник</span>
                {person.externalRole && (
                  <span className="text-[13px] text-fg-faint">
                    {person.externalRole}
                  </span>
                )}
              </>
            ) : (
              <>
                {person.gradeName && (
                  <span className="eyebrow">{person.gradeName}</span>
                )}
                {person.specializationName && (
                  <span className="text-[13px] text-fg-faint">
                    {person.specializationName}
                  </span>
                )}
              </>
            )}
            <Button variant="quiet" onClick={() => setEditing((v) => !v)}>
              {editing ? 'свернуть' : 'изменить'}
            </Button>
          </div>

          {editing && (
            <div className="mt-3">
              <PersonEditor person={person} onDone={() => setEditing(false)} />
            </div>
          )}

          <p className="mt-1.5 text-[13px] text-fg-faint">
            {cadence.lastDoneAt
              ? `Виделись ${cadence.daysSinceLast} ${daysWord(cadence.daysSinceLast ?? 0)} назад`
              : 'Ещё ни разу не встречались'}
            {person.hiredAt && ` · в команде с ${formatDay(person.hiredAt)}`}
          </p>

          <div className="mt-3 max-w-md">
            <ContactBar cadence={cadence} cadenceDays={person.cadenceDays} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={`/person/${personId}/one-on-one`}
              className="inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-0 bg-fg px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
            >
              записать 1-1
            </Link>
            <Link
              to={`/person/${personId}/prep`}
              className="inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-0 border border-line px-3 py-1.5 text-[13px] font-medium text-fg-dim transition-colors hover:border-fg-faint hover:text-fg"
            >
              подготовиться к встрече
            </Link>
          </div>
          </div>

          {card && !card.assessmentsHidden && (
            <div className="w-full max-w-sm lg:w-80">
              <PlayerCard card={card} />
            </div>
          )}
        </header>


        {/* Наверху, а не в боковой колонке: отметить хорошее — такое же
            полноценное действие, как записать встречу, и искать его
            под графиком настроя никто не станет. */}
        {!isPeer && <KarmaQuickAdd personId={personId} />}

        {/* Сразу под кармой: отмечать хорошее и записывать косяки — одно
            движение с разным знаком, и разносить их по разным концам
            страницы значит заставлять искать второе. Смежникам не
            показываем: их ошибки разбирает их руководитель, не ты. */}
        {!isPeer && <IssuesQuickAdd personId={personId} showOpen={false} />}

        <Panel
          title="Открытые обязательства"
          count={openCommitments.iOwe.length + openCommitments.theyOwe.length}
        >
          <CommitmentQuickAdd personId={person.id} />

          {openCommitments.iOwe.length + openCommitments.theyOwe.length > 0 ? (
            <ul className="divide-y divide-line-soft rounded-lg border border-line">
              {[...openCommitments.iOwe, ...openCommitments.theyOwe].map((c) => (
                <CommitmentRow key={c.id} commitment={c} />
              ))}
            </ul>
          ) : (
            <Empty>Всё закрыто.</Empty>
          )}
        </Panel>

        {!isPeer && (
        <Panel title="Что я о нём знаю">
          <p className="mb-2.5 text-[12.5px] text-fg-faint">
            Нажми на блок, чтобы заполнить. У каждого свой срок пересмотра —
            когда он подойдёт, блок сам попросит перечитать себя.
          </p>
          <NoteBlocks personId={personId} blocks={context.noteBlocks} />
        </Panel>
        )}

        {isPeer && (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-fg-faint">
            Смежник — вне твоей команды. Здесь только встречи, договорённости
            и заметки: оценок, настроя и кармы у таких отношений нет.
          </p>
        )}

        {/* В основной колонке, а не в боковой: на трёхстах пикселях изменение
            на один пункт шкалы неразличимо.

            Ниже заметок и обязательств: тренд настроя — фон, а не повод к
            действию. Наверху должно быть то, из-за чего страницу открыли —
            что записать и о чём договориться. */}
        {!isPeer && context.recentCheckins.length > 1 && (
          <Panel title="Как менялся настрой">
            <ClimateTrend checkins={context.recentCheckins} />
          </Panel>
        )}

        {card && !isPeer && (
          <CollapsiblePanel
            title="Оценка"
            summary={
              // ovr — объект со значением и полнотой охвата, а не число:
              // общий уровень не считается, пока оценены не все основные.
              card.ovr.value === null
                ? `оценено ${card.ovr.assessed} из ${card.ovr.total}`
                : `общий ${card.ovr.value}${
                    card.gradeMatch === null
                      ? ''
                      : ` · до уровня ${Math.round(card.gradeMatch * 100)}%`
                  }`
            }
          >
            {/* Ссылка в теле, а не в заголовке: заголовок теперь кнопка
                разворота, и ссылка внутри кнопки — вложенные интерактивные
                элементы, по которым не попасть ни клавиатурой, ни пальцем. */}
            {!card.assessmentsHidden && !gradeChangedRecently && (
              <div className="mb-3 flex justify-end">
                <Link
                  to={`/person/${personId}/reassess`}
                  className="text-[12px] text-fg-faint underline decoration-dotted hover:text-fg-dim"
                >
                  переоценить всё
                </Link>
              </div>
            )}

            {gradeChangedRecently && !card.assessmentsHidden && (
              /* Оценки ставились под старую планку — их стоит перечитать.
                 Пересчитывать их автоматически нельзя: шкала абсолютная,
                 и «четвёрка» значит одно и то же на любом грейде. */
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-info/40 bg-info/5 px-4 py-3">
                <p className="text-[13px] text-info">
                  Грейд сменился {gradeChangedRecently.at && formatDay(gradeChangedRecently.at)} —
                  оценки ставились под прежнюю планку.
                </p>
                <Link
                  to={`/person/${personId}/reassess`}
                  className="ml-auto inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-0 bg-fg px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
                >
                  переоценить
                </Link>
              </div>
            )}

            {/* Карточка не дублируется: она наверху страницы. Здесь только
                редактор — он скрыт вместе с оценками, потому что выставлять
                баллы вслепую, не видя текущих, значит испортить историю. */}
            {!card.assessmentsHidden && <AssessmentEditor card={card} />}
          </CollapsiblePanel>
        )}

        <CollapsiblePanel
          title="История"
          count={items.length}
          summary={items[0] ? `последнее — ${formatDay(items[0].at)}` : undefined}
        >
          {items.length > 0 ? (
            <ol className="space-y-3 border-l border-line pl-4">
              {items.slice(0, historyLimit).map((item, index) => (
                <li key={index} className="relative">
                  <span className="absolute -left-[21px] top-[7px] size-1.5 rounded-full bg-line ring-2 ring-ink" />
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[13.5px] ${item.tone ?? 'text-fg-dim'}`}>
                      {item.title}
                    </span>
                    <span className="tnum text-[11px] text-fg-faint">
                      {formatDay(item.at)}
                    </span>
                  </div>
                  {item.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-faint">
                      {item.detail}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Пока ничего не записано.</Empty>
          )}

          {items.length > historyLimit && (
            <button
              type="button"
              onClick={() => setHistoryLimit((n) => n + HISTORY_STEP)}
              className="mt-3 text-[12.5px] text-fg-faint underline decoration-dotted hover:text-fg-dim"
            >
              показать ещё · осталось {items.length - historyLimit}
            </button>
          )}
        </CollapsiblePanel>




      </div>

      <aside className="space-y-9">
        {!isPeer && (
          <Panel title={`Карма · ${context.karmaSummary.windowDays} дней`}>
            <KarmaSummary summary={context.karmaSummary} records={timeline.karma} />
          </Panel>
        )}
        {!isPeer && issues && (
          <Panel title="Косяки">
            <IssuesSummary personId={personId} summary={issues} />
          </Panel>
        )}
        {!isPeer && (
          <Panel title="Отсутствия" count={timeline.absences.length}>
            <AbsencePanel personId={personId} absences={timeline.absences} />
          </Panel>
        )}
      </aside>
    </div>
  );
}

function CommitmentRow({
  commitment,
}: {
  commitment: {
    id: number;
    direction: 'i_owe' | 'they_owe';
    title: string;
    dueAt: string | null;
  };
}) {
  const update = useUpdateCommitment();
  const isMine = commitment.direction === 'i_owe';
  const isOverdue = commitment.dueAt !== null && commitment.dueAt < today();

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
      <span className={`eyebrow shrink-0 ${isMine ? 'text-critical' : 'text-fg-faint'}`}>
        {isMine ? 'я обещал' : 'он обещал'}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px]">{commitment.title}</span>
      {commitment.dueAt && (
        <span
          className={`tnum shrink-0 text-[12px] ${
            isOverdue ? 'text-critical' : 'text-fg-faint'
          }`}
        >
          {formatRelative(commitment.dueAt)}
        </span>
      )}
      <Button
        onClick={() => update.mutate({ id: commitment.id, status: 'done' })}
        disabled={update.isPending}
      >
        ✓ сделано
      </Button>
    </li>
  );
}
