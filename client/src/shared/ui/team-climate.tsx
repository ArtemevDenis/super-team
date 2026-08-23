import { Empty } from './primitives';
import type { TeamAxisSummaryType, TeamClimateType } from '../types';

const SCALE_MAX = 5;

const AXIS_HINT: Record<string, string> = {
  motivation: '↑ лучше',
  satisfaction: '↑ лучше',
  workloadPressure: '↑ хуже',
};

const AXIS_COLOR: Record<string, string> = {
  motivation: '#63a851',
  satisfaction: '#4a8cc4',
  workloadPressure: '#d15a3d',
};

/**
 * Среднее по команде всегда идёт вместе с распределением.
 *
 * Команда, где все на тройке, и команда, где половина на пятёрке, а
 * половина на единице, дают одинаковое среднее — но вторая в кризисе.
 * Одна цифра эту разницу стирает, поэтому под ней всегда стоит гистограмма.
 */
export function TeamClimate({ climate }: { climate: TeamClimateType }) {
  if (climate.measuredPeople === 0) {
    return (
      <Empty>
        Ни одного замера настроя. Они ставятся тремя кликами в форме 1-1.
      </Empty>
    );
  }

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {climate.axes.map((axis) => (
          <AxisTile key={axis.key} axis={axis} />
        ))}
      </ul>

      <p className="mt-2 px-1 text-[11.5px] text-fg-faint">
        По последнему замеру каждого из {climate.measuredPeople}{' '}
        {climate.measuredPeople === climate.totalPeople
          ? 'человек'
          : `из ${climate.totalPeople} человек`}
        {climate.measuredPeople < climate.totalPeople &&
          ' · остальных ещё не замеряли'}
      </p>
    </div>
  );
}

function AxisTile({ axis }: { axis: TeamAxisSummaryType }) {
  const color = AXIS_COLOR[axis.key] ?? '#4a8cc4';
  const delta =
    axis.average !== null && axis.previousAverage !== null
      ? axis.average - axis.previousAverage
      : null;

  // Улучшение зависит от знака оси, а не от направления сдвига.
  const isBetter =
    delta === null || Math.abs(delta) < 0.05
      ? null
      : delta > 0 === axis.higherIsBetter;

  const maxBucket = Math.max(...axis.distribution, 1);

  return (
    <li className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[12.5px] text-fg-dim">{axis.label}</span>
        <span
          className={`text-[10.5px] ${
            axis.higherIsBetter ? 'text-fg-faint' : 'text-critical/70'
          }`}
        >
          {AXIS_HINT[axis.key]}
        </span>
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="tnum text-2xl font-semibold leading-none">
          {axis.average === null ? '—' : axis.average.toFixed(1)}
        </span>
        <span className="tnum text-[12px] text-fg-faint">из {SCALE_MAX}</span>
        {isBetter !== null && (
          <span
            className={`tnum ml-auto text-[12px] ${
              isBetter ? 'text-positive' : 'text-critical'
            }`}
          >
            {delta! > 0 ? '↑' : '↓'}
            {Math.abs(delta!).toFixed(1)}
          </span>
        )}
      </div>

      {/* Гистограмма по шкале: видно не только среднее, но и раскол. */}
      <ul className="mt-2.5 flex items-end gap-1" aria-hidden="true">
        {axis.distribution.map((count, index) => {
          const value = index + 1;
          const isWorst = axis.worstValue === value && count > 0;
          return (
            <li key={value} className="flex-1">
              <span
                className="block rounded-sm"
                style={{
                  height: `${4 + (count / maxBucket) * 20}px`,
                  backgroundColor: count === 0 ? 'var(--color-line-soft)' : color,
                  opacity: count === 0 ? 1 : isWorst ? 1 : 0.55,
                }}
              />
              <span className="tnum mt-1 block text-center text-[9.5px] text-fg-faint">
                {value}
              </span>
            </li>
          );
        })}
      </ul>

      {axis.worstCount > 0 && axis.worstValue !== null && (
        <p className="mt-1.5 text-[11.5px] text-fg-faint">
          Худшее значение {axis.worstValue} —{' '}
          <span className="text-fg-dim">
            у {axis.worstCount}{' '}
            {axis.worstCount === 1
              ? 'человека'
              : axis.worstCount < 5
                ? 'человек'
                : 'человек'}
          </span>
        </p>
      )}
    </li>
  );
}
