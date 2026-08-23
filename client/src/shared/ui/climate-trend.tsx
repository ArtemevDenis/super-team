import { formatDay } from '../dates';
import type { CheckinType } from '../types';

/**
 * Три отдельных мини-графика, а не три линии в одних осях.
 *
 * У перегрузки обратный смысл: её рост — это «хуже», а рост двух других —
 * «лучше». В общих осях взгляд читает три растущие линии как «всё хорошо»,
 * то есть график сообщает обратное правде. Разделение снимает это и заодно
 * даёт каждой мере собственную подпись направления.
 *
 * Цвета отдельные от палитры важности: та подбиралась под крупные заливки
 * и текст, а для линии в два пикселя она слишком приглушена — проверка
 * показала, что мотивацию и удовлетворённость не различал бы даже человек
 * с полным цветовосприятием.
 */

const SCALE_MIN = 1;
const SCALE_MAX = 5;

type SeriesType = {
  key: 'motivation' | 'satisfaction' | 'workloadPressure';
  label: string;
  color: string;
  /** Подпись направления — единственная защита от чтения наоборот. */
  hint: string;
  higherIsBetter: boolean;
};

const SERIES: readonly SeriesType[] = [
  {
    key: 'motivation',
    label: 'Мотивация',
    color: '#63a851',
    hint: '↑ лучше',
    higherIsBetter: true,
  },
  {
    key: 'satisfaction',
    label: 'Удовлетворённость',
    color: '#4a8cc4',
    hint: '↑ лучше',
    higherIsBetter: true,
  },
  {
    key: 'workloadPressure',
    label: 'Перегрузка',
    color: '#d15a3d',
    hint: '↑ хуже',
    higherIsBetter: false,
  },
];

export function ClimateTrend({ checkins }: { checkins: CheckinType[] }) {
  // Приходят новыми первыми, а рисовать надо слева направо по времени.
  const points = [...checkins].reverse();
  if (points.length < 2) return null;

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="eyebrow">Замеры на 1-1</span>
        <span className="tnum text-[11px] text-fg-faint">
          шкала {SCALE_MIN}–{SCALE_MAX}
        </span>
      </div>

      <div className="space-y-3.5">
        {SERIES.map((series) => (
          <Sparkline key={series.key} series={series} points={points} />
        ))}
      </div>

      <p className="tnum mt-3 border-t border-line-soft pt-2 text-[11px] text-fg-faint">
        {formatDay(points[0]!.measuredAt)} —{' '}
        {formatDay(points[points.length - 1]!.measuredAt)} · {points.length} замеров
      </p>
    </div>
  );
}

function Sparkline({
  series,
  points,
}: {
  series: SeriesType;
  points: CheckinType[];
}) {
  const values = points.map((point) => point[series.key]);
  const last = values[values.length - 1]!;
  const previous = values[values.length - 2]!;
  const delta = last - previous;

  const width = 100;
  const height = 24;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const toY = (value: number) =>
    height - ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * height;

  const path = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * stepX).toFixed(1)},${toY(value).toFixed(1)}`)
    .join(' ');

  // Улучшение или ухудшение зависит от знака оси, а не от направления линии.
  const isBetter = delta === 0 ? null : delta > 0 === series.higherIsBetter;

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="truncate text-[12.5px] text-fg-dim">{series.label}</span>
        <span
          className={`shrink-0 text-[10.5px] ${
            series.higherIsBetter ? 'text-fg-faint' : 'text-critical/70'
          }`}
        >
          {series.hint}
        </span>

        <span className="tnum ml-auto text-[12.5px] text-fg">
          {last}
          <span className="text-fg-faint">/{SCALE_MAX}</span>
        </span>
        {delta !== 0 && (
          <span
            className={`tnum w-6 text-right text-[11px] ${
              isBetter ? 'text-positive' : 'text-critical'
            }`}
          >
            {delta > 0 ? '↑' : '↓'}
            {Math.abs(delta)}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {/* Подписи оси — обычным текстом, а не внутри svg: при неравномерном
            масштабе шрифт внутри графика растянулся бы. */}
        <div className="tnum flex w-2 shrink-0 flex-col justify-between py-[1px] text-[9px] leading-none text-fg-faint">
          <span>{SCALE_MAX}</span>
          <span>{SCALE_MIN}</span>
        </div>

        <div className="relative h-12 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label={`${series.label}: сейчас ${last} из ${SCALE_MAX}, ${series.hint}`}
          >
            {/* Сетка по каждому шагу шкалы: так изменение на один пункт можно
                пересчитать глазами, не растягивая ось под размах данных.
                Обрезанная ось сделала бы обычное колебание похожим на обвал. */}
            {[1, 2, 3, 4, 5].map((step) => (
              <line
                key={step}
                x1="0"
                x2={width}
                y1={toY(step)}
                y2={toY(step)}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray={step === SCALE_MIN || step === SCALE_MAX ? '2 3' : '1 5'}
                vectorEffect="non-scaling-stroke"
                className={step === SCALE_MIN || step === SCALE_MAX ? 'text-line' : 'text-line-soft'}
              />
            ))}
            <path
              d={path}
              fill="none"
              stroke={series.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Точки отдельными элементами: при неравномерном масштабе
              svg-кружок превратился бы в эллипс. */}
          {values.map((value, index) => {
            const isLast = index === values.length - 1;
            return (
              <span
                key={index}
                title={`${points[index]!.measuredAt}: ${value} из ${SCALE_MAX}`}
                className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  isLast ? 'size-2.5 ring-2 ring-surface' : 'size-1.5 opacity-70'
                }`}
                style={{
                  left: `${(index / (values.length - 1)) * 100}%`,
                  top: `${(toY(value) / height) * 100}%`,
                  backgroundColor: series.color,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
