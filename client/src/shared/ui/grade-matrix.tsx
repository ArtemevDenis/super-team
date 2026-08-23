import {
  useGradeExpectations,
  useReference,
  useRemoveGradeExpectation,
  useSetGradeExpectation,
} from '../api';
import { Empty } from './primitives';
import type { AttributeSettingType } from '../types';

const SCALE = [1, 2, 3, 4, 5];

/**
 * Матрица ожиданий: строки — атрибуты, столбцы — грейды.
 *
 * Она и делает карточку инструментом роста, а не оценкой человека: без
 * ожиданий OVR отвечает «сколько у него», а с ними — «чего не хватает до
 * следующего уровня». Таблицей это видно целиком, а по одному полю на
 * грейд — нет.
 */
export function GradeMatrix({
  attributes,
}: {
  attributes: AttributeSettingType[];
}) {
  const { data: reference } = useReference();
  const { data: expectations } = useGradeExpectations();
  const setExpectation = useSetGradeExpectation();
  const removeExpectation = useRemoveGradeExpectation();

  if (!reference || !expectations) return null;

  const grades = [...reference.grades].sort((a, b) => a.level - b.level);
  const rows = attributes.filter((a) => a.kind === 'core' && a.isActive);

  if (rows.length === 0 || grades.length === 0) {
    return <Empty>Нужны хотя бы один общий атрибут и один грейд.</Empty>;
  }

  const valueFor = (gradeId: number, attributeId: number) =>
    expectations.find(
      (e) => e.gradeId === gradeId && e.attributeId === attributeId,
    )?.expectedValue ?? null;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr>
              <th className="eyebrow border-b border-line pb-2 text-left">
                Атрибут
              </th>
              {grades.map((grade) => (
                <th
                  key={grade.id}
                  className="eyebrow border-b border-line px-1 pb-2 text-center"
                >
                  {grade.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((attribute) => (
              <tr key={attribute.id} className="border-b border-line-soft">
                <td className="py-2 pr-3">
                  <span className="text-[13px]">{attribute.name}</span>
                  <span className="eyebrow ml-2">{attribute.shortCode}</span>
                </td>

                {grades.map((grade) => {
                  const value = valueFor(grade.id, attribute.id);
                  return (
                    <td key={grade.id} className="px-1 py-1.5 text-center">
                      <div className="flex justify-center gap-0.5">
                        {SCALE.map((score) => (
                          <button
                            key={score}
                            type="button"
                            title={`${attribute.name} · ${grade.name}: ${score}`}
                            onClick={() =>
                              value === score
                                ? removeExpectation.mutate({
                                    gradeId: grade.id,
                                    attributeId: attribute.id,
                                  })
                                : setExpectation.mutate({
                                    gradeId: grade.id,
                                    attributeId: attribute.id,
                                    expectedValue: score,
                                  })
                            }
                            className={`tnum size-6 rounded text-[11.5px] transition-colors ${
                              value === score
                                ? 'bg-fg text-ink'
                                : value !== null && score < value
                                  ? 'bg-line text-fg-faint'
                                  : 'bg-line-soft text-fg-faint hover:bg-line hover:text-fg-dim'
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-relaxed text-fg-faint">
        Повторный клик по выбранному значению убирает ожидание — тогда атрибут
        перестаёт участвовать в соответствии этому грейду. Незаполненная строка
        означает «от этого грейда здесь ничего не ждём», а не ноль.
      </p>
    </div>
  );
}
