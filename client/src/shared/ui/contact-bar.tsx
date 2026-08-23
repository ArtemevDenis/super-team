import type { CadenceStateType } from '../types';
import { daysWord } from '../dates';

type PropsType = {
  cadence: CadenceStateType;
  cadenceDays: number;
};

/**
 * Полоса контакта — подпись всего приложения.
 *
 * Одна графика кодирует четыре доменных понятия сразу: личную каденцию
 * (засечка), сколько её уже израсходовано (заливка), просрочку (штриховка
 * за засечкой) и паузу на отпуск (полоса гаснет). Последнее особенно важно:
 * правило «в отпуске часы стоят» иначе остаётся невидимым, и выглядит так,
 * будто приложение просто забыло про человека.
 */
export function ContactBar({ cadence, cadenceDays }: PropsType) {
  const { isAbsentToday, neverMet, effectiveDaysSinceLast, overdueDays } = cadence;

  if (isAbsentToday) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-[3px] flex-1 rounded-full bg-line" />
        <span className="eyebrow shrink-0">в отпуске · часы стоят</span>
      </div>
    );
  }

  if (neverMet) {
    return (
      <div className="flex items-center gap-2">
        <div className="hatched h-[3px] flex-1 rounded-full text-critical opacity-70" />
        <span className="eyebrow shrink-0 text-critical">ни одной встречи</span>
      </div>
    );
  }

  const elapsed = effectiveDaysSinceLast ?? 0;
  const span = Math.max(cadenceDays, elapsed, 1);
  const withinPercent = (Math.min(elapsed, cadenceDays) / span) * 100;
  const overduePercent = (overdueDays / span) * 100;
  const duePercent = (cadenceDays / span) * 100;

  const fillColor = overdueDays > 0 ? 'bg-critical' : 'bg-info';

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-line-soft">
        <div
          className={`absolute inset-y-0 left-0 ${fillColor} opacity-80`}
          style={{ width: `${withinPercent}%` }}
        />
        {overdueDays > 0 && (
          <div
            className="hatched absolute inset-y-0 text-critical"
            style={{ left: `${duePercent}%`, width: `${overduePercent}%` }}
          />
        )}
        {/* Засечка срока: видно, где кончается «нормально» и начинается долг. */}
        <div
          className="absolute inset-y-[-2px] w-px bg-fg-faint"
          style={{ left: `${duePercent}%` }}
        />
      </div>
      <span
        className={`tnum shrink-0 text-[11px] ${
          overdueDays > 0 ? 'text-critical' : 'text-fg-faint'
        }`}
        title={
          overdueDays > 0
            ? `Просрочено на ${overdueDays} ${daysWord(overdueDays)} сверх каденции в ${cadenceDays}`
            : `Прошло ${elapsed} из ${cadenceDays} дней личной каденции`
        }
      >
        {overdueDays > 0
          ? `+${overdueDays} ${daysWord(overdueDays)}`
          : `${elapsed}/${cadenceDays} дн.`}
      </span>
    </div>
  );
}
