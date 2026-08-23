import { Link } from 'react-router-dom';

import {
  useDashboard,
  useMuteAlert,
  usePeople,
  useQuickMarkDone,
} from '../shared/api';
import { daysWord, formatRelative } from '../shared/dates';
import { Avatar } from '../shared/ui/avatar';
import { ContactBar } from '../shared/ui/contact-bar';
import { KarmaWidget } from '../shared/ui/karma-widget';
import {
  Button,
  Empty,
  Panel,
  SEVERITY_BORDER,
  SEVERITY_DOT,
  SEVERITY_TEXT,
} from '../shared/ui/primitives';
import type { PersonAlertGroupType } from '../shared/types';

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: people } = usePeople();
  const quickDone = useQuickMarkDone();
  const mute = useMuteAlert();

  if (isLoading) {
    return <p className="text-[13px] text-fg-faint">Загружаю…</p>;
  }

  if (error) {
    return (
      <p className="text-[13px] text-critical">
        Сервер не отвечает. Проверь, что запущен <code>npm run dev</code>.
      </p>
    );
  }

  if (!data) return null;

  const hasSignals = data.groups.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-10">
        <Panel
          title="Разобраться сегодня"
          count={data.groups.length}
          action={
            data.groupsHidden > 0 ? (
              <span className="text-[11px] text-fg-faint">
                и ещё {data.groupsHidden} —{' '}
                <Link to="/people" className="underline hover:text-fg-dim">
                  вся команда
                </Link>
              </span>
            ) : null
          }
        >
          {hasSignals ? (
            <ul className="space-y-2.5">
              {data.groups.map((group) => (
                <PersonRow
                  key={group.personId}
                  group={group}
                  onQuickDone={() => quickDone.mutate(group.personId)}
                  onMute={(key) => mute.mutate({ alertKey: key })}
                  busy={quickDone.isPending || mute.isPending}
                />
              ))}
            </ul>
          ) : (
            <Empty>
              Ни одного сигнала. Все встречи в срок, обещания закрыты.
            </Empty>
          )}
        </Panel>

        <Panel title="Карма">
          <KarmaWidget people={people ?? []} />
        </Panel>

        <Panel title="Просроченные обещания" count={data.overdueCommitments.length}>
          {data.overdueCommitments.length > 0 ? (
            <ul className="divide-y divide-line-soft rounded-lg border border-line">
              {data.overdueCommitments.map((commitment) => (
                <li
                  key={commitment.id}
                  className="flex items-baseline gap-3 px-3.5 py-2.5"
                >
                  {/* Свои сломанные обещания отделены визуально: доверие
                      ломается именно здесь, а не на чужой просрочке. */}
                  <span
                    className={`eyebrow shrink-0 ${
                      commitment.direction === 'i_owe'
                        ? 'text-critical'
                        : 'text-fg-faint'
                    }`}
                  >
                    {commitment.direction === 'i_owe' ? 'я обещал' : 'он обещал'}
                  </span>
                  <Link
                    to={`/person/${commitment.personId}`}
                    className="min-w-0 flex-1 truncate text-[13.5px] hover:underline"
                  >
                    {commitment.title}
                    <span className="ml-2 text-fg-faint">
                      · {commitment.personName}
                    </span>
                  </Link>
                  <span className="tnum shrink-0 text-[12px] text-critical">
                    {commitment.overdueDays} {daysWord(commitment.overdueDays)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ни одного просроченного обещания — ни твоего, ни чужого.</Empty>
          )}
        </Panel>
      </div>

      <aside className="space-y-10">
        <Panel title="Ближайшие 1-1" count={data.upcoming.length}>
          {data.upcoming.length > 0 ? (
            <ul className="space-y-1">
              {data.upcoming.map((meeting) => (
                <li key={meeting.oneOnOneId}>
                  <Link
                    to={`/person/${meeting.personId}/prep`}
                    className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface"
                  >
                    <span className="truncate text-[13.5px]">
                      {meeting.personName}
                    </span>
                    <span className="tnum shrink-0 text-[12px] text-fg-faint">
                      {formatRelative(meeting.plannedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ничего не запланировано.</Empty>
          )}
        </Panel>

        {data.goodNews.length > 0 && (
          <Panel title="Хорошие новости">
            <ul className="space-y-1.5">
              {data.goodNews.map((news) => (
                <li key={news.key} className="flex items-baseline gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-positive" />
                  <span className="text-[13px]">
                    <Link
                      to={`/person/${news.personId}`}
                      className="text-fg hover:underline"
                    >
                      {news.personName}
                    </Link>
                    <span className="text-fg-dim"> — {news.title}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {data.quietPeople.length > 0 && (
          <Panel title="Всё в порядке" count={data.quietPeople.length}>
            <ul className="flex flex-wrap gap-1.5">
              {data.quietPeople.map((person) => (
                <li key={person.id}>
                  <Link
                    to={`/person/${person.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] text-fg-dim hover:border-fg-faint hover:text-fg"
                  >
                    {person.cadence.isAbsentToday && (
                      <span className="size-1.5 rounded-full bg-fg-faint" />
                    )}
                    {person.fullName}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}

function PersonRow({
  group,
  onQuickDone,
  onMute,
  busy,
}: {
  group: PersonAlertGroupType;
  onQuickDone: () => void;
  onMute: (alertKey: string) => void;
  busy: boolean;
}) {
  const needsMeeting = group.alerts.some(
    (a) => a.type === 'one_on_one_overdue' || a.type === 'first_one_on_one_missing',
  );

  return (
    <li
      className={`rounded-lg border border-line border-l-2 bg-surface ${
        SEVERITY_BORDER[group.worstSeverity]
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
        <Link to={`/person/${group.personId}`} className="shrink-0">
          <Avatar
            fullName={group.personName}
            photoPath={group.photoPath}
            size={32}
          />
        </Link>
        <Link
          to={`/person/${group.personId}`}
          className="text-[15px] font-semibold tracking-tight hover:underline"
        >
          {group.personName}
        </Link>
        <span className="tnum text-[11px] text-fg-faint">
          {group.alerts.length}{' '}
          {group.alerts.length === 1
            ? 'сигнал'
            : group.alerts.length < 5
              ? 'сигнала'
              : 'сигналов'}
        </span>

        {/*
          На телефоне кнопки занимают всю строку поровну, а не жмутся вправо:
          при переносе прижатая вправо пара оставляла пустую полосу под
          именем, и это читалось как сломанная вёрстка. Заодно попасть
          пальцем в широкую кнопку проще.
        */}
        <div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {needsMeeting && (
            <>
              {/* Путь на секунду: пустая, но фактически верная запись лучше
                  пропущенной — иначе каденция начнёт врать навсегда. */}
              <Button onClick={onQuickDone} disabled={busy}>
                провёл ✓
              </Button>
              <Link
                to={`/person/${group.personId}/one-on-one`}
                className="inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-0 bg-fg px-2.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-white"
              >
                записать 1-1
              </Link>
            </>
          )}
          {!needsMeeting && (
            <Link
              to={`/person/${group.personId}/prep`}
              className="inline-flex min-h-11 items-center justify-center rounded-md sm:min-h-0 border border-line px-2.5 py-1.5 text-[13px] font-medium text-fg-dim transition-colors hover:border-fg-faint hover:text-fg"
            >
              открыть
            </Link>
          )}
        </div>
      </div>

      <ul className="mt-2.5 space-y-1.5 px-4">
        {group.alerts.map((alert) => (
          <li key={alert.key} className="group flex items-baseline gap-2">
            <span
              className={`mt-[7px] size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[alert.severity]}`}
            />
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
              <span className={SEVERITY_TEXT[alert.severity]}>{alert.title}</span>
              {alert.detail && (
                <span className="text-fg-faint"> — {alert.detail}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onMute(alert.key)}
              disabled={busy}
              title="Скрыть на неделю"
              className="shrink-0 text-[11px] text-fg-faint opacity-0 transition-opacity hover:text-fg-dim focus-visible:opacity-100 group-hover:opacity-100"
            >
              на неделю
            </button>
          </li>
        ))}
      </ul>

      <div className="px-4 pb-3 pt-3">
        <ContactBar cadence={group.cadence} cadenceDays={group.cadenceDays} />
      </div>
    </li>
  );
}
