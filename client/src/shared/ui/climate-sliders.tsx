import { useRef } from 'react';

import type { CheckinType } from '../types';

type ClimateValueType = {
  motivation: number;
  workloadPressure: number;
  satisfaction: number;
};

type AxisType = keyof ClimateValueType;

const AXES: {
  key: AxisType;
  label: string;
  low: string;
  high: string;
  /** У нагрузки высокое значение — плохо, поэтому цвет считается инверсно. */
  higherIsBetter: boolean;
}[] = [
  { key: 'motivation', label: 'Мотивация', low: 'выгорел', high: 'горит', higherIsBetter: true },
  { key: 'workloadPressure', label: 'Нагрузка', low: 'простаивает', high: 'перегружен', higherIsBetter: false },
  { key: 'satisfaction', label: 'Удовлетворённость', low: 'всё плохо', high: 'всё отлично', higherIsBetter: true },
];

function toneFor(value: number, higherIsBetter: boolean): string {
  const goodness = higherIsBetter ? value : 6 - value;
  if (goodness <= 2) return 'bg-critical';
  if (goodness === 3) return 'bg-warning';
  return 'bg-positive';
}

export function ClimateSliders({
  value,
  previous,
  onChange,
  onComplete,
}: {
  value: ClimateValueType | null;
  previous: CheckinType | null;
  onChange: (value: ClimateValueType) => void;
  onComplete?: () => void;
}) {
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (!value) return null;

  const set = (axis: AxisType, next: number, axisIndex: number) => {
    onChange({ ...value, [axis]: next });

    // Клавиши 1–5 ставят значение и переводят фокус дальше: весь блок
    // климата — три нажатия, а не три подхода мышью.
    //
    // Фокус уходит на саму группу, а не на кнопку внутри неё. Сфокусированная
    // кнопка срабатывает по пробелу — и тогда любой пробел в заметках, если
    // не кликнуть в поле мышью, молча меняет соседнюю оценку. Замер климата
    // при этом выглядит достоверным, а он испорчен.
    const nextGroup = groupRefs.current[axisIndex + 1];
    if (nextGroup) nextGroup.focus();
    else onComplete?.();
  };

  return (
    <div className="space-y-3.5">
      {AXES.map((axis, axisIndex) => {
        const current = value[axis.key];
        const before = previous?.[axis.key];
        const delta = before === undefined ? null : current - before;

        return (
          <div key={axis.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-fg-dim">{axis.label}</span>
              {before !== undefined && (
                <span className="tnum text-[11px] text-fg-faint">
                  было {before}
                  {delta !== null && delta !== 0 && (
                    <span
                      className={
                        (delta > 0) === axis.higherIsBetter
                          ? 'text-positive'
                          : 'text-critical'
                      }
                    >
                      {' '}
                      {delta > 0 ? '↑' : '↓'}
                      {Math.abs(delta)}
                    </span>
                  )}
                </span>
              )}
            </div>

            <div
              ref={(node) => {
                groupRefs.current[axisIndex] = node;
              }}
              role="radiogroup"
              aria-label={axis.label}
              tabIndex={0}
              className="flex gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-info"
              onKeyDown={(event) => {
                const digit = Number(event.key);
                if (digit >= 1 && digit <= 5) {
                  event.preventDefault();
                  set(axis.key, digit, axisIndex);
                  return;
                }
                // Пробел на группе не должен ни скроллить страницу, ни что-либо
                // выбирать: значение ставится только цифрой или мышью.
                if (event.key === ' ') event.preventDefault();
              }}
            >
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  role="radio"
                  aria-checked={current === score}
                  aria-label={`${axis.label}: ${score} из 5`}
                  tabIndex={-1}
                  onClick={() => set(axis.key, score, axisIndex)}
                  className={`h-8 flex-1 rounded transition-colors ${
                    score <= current
                      ? toneFor(current, axis.higherIsBetter)
                      : 'bg-line-soft hover:bg-line'
                  }`}
                />
              ))}
            </div>

            <div className="mt-1 flex justify-between text-[11px] text-fg-faint">
              <span>{axis.low}</span>
              <span>{axis.high}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
