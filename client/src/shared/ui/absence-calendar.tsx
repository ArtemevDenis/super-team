import { Link } from 'react-router-dom';

import { daysBetween, daysWord, formatDay, today } from '../dates';
import { Avatar } from './avatar';
import { Empty } from './primitives';
import type {
  AbsenceCalendarType,
  CalendarGroupType,
  CalendarPersonType,
} from '../types';

const KIND_COLOR: Record<string, string> = {
  отпуск: '#4a8cc4',
  больничный: '#d15a3d',
  другое: '#8a8f99',
  отсутствие: '#8a8f99',
};

/**
 * Календарь отсутствий на три месяца вперёд.
 *
 * Смысл не в списке отпусков — список читается и в чате. Смысл в том, чтобы
 * увидеть пересечения: неделя, когда из трёх мобильщиков остаётся один,
 * заметна только на общей шкале, и заметить её надо до того, как она
 * наступит.
 */
export function AbsenceCalendar({ calendar }: { calendar: AbsenceCalendarType }) {
  const allGroups = calendar.departments.flatMap((d) => d.groups);
  const hasAny = allGroups.some((group) =>
    group.people.some((person) => person.absences.length > 0),
  );

  if (!hasAny) {
    return (
      <Empty>
        На ближайшие три месяца отпусков не отмечено. Они ставятся на карточке
        человека.
      </Empty>
    );
  }

  const gaps = allGroups.flatMap((group) =>
    group.gaps.map((gap) => ({ label: group.label, gap })),
  );

  return (
    <div className="space-y-3">
      {gaps.length > 0 && (
        <ul className="space-y-1">
          {gaps.map(({ label, gap }) => (
            <li
              key={`${label}-${gap.fromDay}`}
              className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-[12.5px] text-warning"
            >
              <span className="font-medium">{label}</span>
              <span className="text-warning/80">
                {/* Границы отрезка — конкретные дни, а не неделя: неделя как
                    единица завышает, потому что двое могут попасть в один
                    календарный отрезок, не пересёкшись ни одним днём. */}
                — {formatDay(gap.fromDay)} — {formatDay(gap.toDay)}:
                одновременно нет <span className="tnum">{gap.awayCount}</span> из{' '}
                <span className="tnum">{gap.total}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <MonthHeader calendar={calendar} />

          <div className="space-y-5">
            {calendar.departments.map((department) => (
              <div key={department.name}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: department.color }}
                  />
                  <span className="text-[13px] font-medium">{department.name}</span>
                </div>

                <div className="space-y-3">
                  {department.groups.map((group) => (
                    <GroupRows
                      key={group.label}
                      group={group}
                      calendar={calendar}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {['отпуск', 'больничный', 'другое'].map((kind) => (
          <li key={kind} className="flex items-center gap-1.5 text-[11px] text-fg-faint">
            <span
              className="inline-block h-2 w-4 rounded-sm"
              style={{ backgroundColor: KIND_COLOR[kind] }}
            />
            {kind}
          </li>
        ))}
      </ul>
    </div>
  );
}

const NAME_WIDTH = 'w-44';

function MonthHeader({ calendar }: { calendar: AbsenceCalendarType }) {
  return (
    <div className="mb-2 flex items-end">
      <div className={`${NAME_WIDTH} shrink-0`} />
      <div className="flex flex-1 border-b border-line">
        {calendar.months.map((month) => (
          <div
            key={month.startDay}
            className="eyebrow border-l border-line pb-1 pl-1.5 first:border-l-0 first:pl-0"
            style={{ width: `${(month.days / calendar.totalDays) * 100}%` }}
          >
            {month.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Единица группировки — специализация внутри отдела: подменяют друг друга
 * те, кто делает одну работу, и андроидчик не закроет iOS.
 */
function GroupRows({
  group,
  calendar,
}: {
  group: CalendarGroupType;
  calendar: AbsenceCalendarType;
}) {
  return (
    <div>
      <div className={`mb-1 flex items-center gap-2 ${NAME_WIDTH}`}>
        <span className="eyebrow">{group.specializationName}</span>
        <span className="tnum text-[11px] text-fg-faint">
          {group.people.length}
        </span>
        {group.gaps.length > 0 && (
          <span className="text-[11px] text-warning">провал</span>
        )}
      </div>

      <ul className="space-y-1">
        {group.people.map((person) => (
          <PersonRow key={person.personId} person={person} calendar={calendar} />
        ))}
      </ul>
    </div>
  );
}

function PersonRow({
  person,
  calendar,
}: {
  person: CalendarPersonType;
  calendar: AbsenceCalendarType;
}) {
  const offsetPercent = (day: string) =>
    (Math.max(0, daysBetween(calendar.from, day)) / calendar.totalDays) * 100;

  const todayPercent = offsetPercent(today());

  return (
    <li className="flex items-center">
      <Link
        to={`/person/${person.personId}`}
        className={`${NAME_WIDTH} flex shrink-0 items-center gap-2 pr-3 hover:underline`}
      >
        <Avatar fullName={person.fullName} photoPath={person.photoPath} size={20} />
        <span className="truncate text-[12.5px] text-fg-dim">{person.fullName}</span>
      </Link>

      <div className="relative h-5 flex-1 rounded bg-line-soft/40">
        {/* Границы недель: без них полосу невозможно соотнести с датой. */}
        {calendar.weekStarts.map((week) => {
          const left = offsetPercent(week);
          if (left <= 0 || left >= 100) return null;
          return (
            <span
              key={week}
              className="absolute inset-y-0 w-px bg-line"
              style={{ left: `${left}%` }}
            />
          );
        })}

        <span
          className="absolute inset-y-[-2px] w-px bg-fg-faint"
          style={{ left: `${todayPercent}%` }}
          title="сегодня"
        />

        {person.absences.map((absence) => {
          const left = offsetPercent(absence.fromDay);
          const right = offsetPercent(absence.toDay);
          const width = Math.max(1, right - left + 100 / calendar.totalDays);
          const length = daysBetween(absence.fromDay, absence.toDay) + 1;

          return (
            <span
              key={absence.id}
              title={`${absence.kind}: ${formatDay(absence.fromDay)} — ${formatDay(absence.toDay)} · ${length} ${daysWord(length)}`}
              className="absolute inset-y-0.5 rounded-sm"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: KIND_COLOR[absence.kind] ?? KIND_COLOR.другое,
              }}
            />
          );
        })}
      </div>
    </li>
  );
}
