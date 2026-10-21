import { useNavigate } from 'react-router-dom';

import { useMyCommitments, useUpdateCommitment } from '../api';
import { daysBetween, formatRelative, today } from '../dates';

/**
 * «Я обещал» по активной команде. Отдельно от дел намеренно: обещание
 * дано человеку и закрывается перед ним, дело — только перед собой.
 *
 * Имя ведёт на карточку в основном окне: виджет рендерится порталом из того
 * же приложения, поэтому навигация уходит в главную вкладку, а не в окошко.
 */
export function MyCommitments() {
  const { data = [], isLoading } = useMyCommitments();
  const update = useUpdateCommitment();
  const navigate = useNavigate();

  if (isLoading) return null;
  if (data.length === 0) {
    return (
      <p className="px-1 py-3 text-center text-[12.5px] text-fg-faint">
        Открытых обещаний нет.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {data.map((item) => {
        const diff = item.dueAt ? daysBetween(today(), item.dueAt) : null;
        const tone =
          diff === null ? '' : diff < 0 ? 'text-critical' : diff === 0 ? 'text-warning' : 'text-fg-faint';

        return (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-md px-1 py-1.5 hover:bg-surface"
          >
            <input
              type="checkbox"
              checked={false}
              onChange={() => update.mutate({ id: item.id, status: 'done' })}
              disabled={update.isPending}
              className="mt-1 size-3.5 shrink-0 cursor-pointer accent-positive"
            />
            <div className="min-w-0 flex-1">
              <p className="break-words text-[13.5px] leading-5 text-fg">{item.title}</p>
              <button
                type="button"
                onClick={() => navigate(`/person/${item.personId}`)}
                className="text-[11.5px] text-fg-faint hover:text-fg-dim"
              >
                {item.personName}
              </button>
            </div>
            {item.dueAt && (
              <span className={`tnum shrink-0 text-[11.5px] leading-5 ${tone}`}>
                {formatRelative(item.dueAt)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
