import { Link } from 'react-router-dom';

import { Avatar } from './avatar';
import type { CardTierType, PersonCardType, ScoredAttributeType } from '../types';

/**
 * Единственное громкое место в приложении.
 *
 * Всё остальное — тихий прибор, поэтому смелость макета потрачена здесь:
 * карточка и есть то, ради чего приложение открывают просто так. Но врать
 * она при этом не должна, поэтому неполная оценка показывается как `??`,
 * а не как среднее по тому, что успели поставить.
 */

const TIER_STYLE: Record<CardTierType, { frame: string; label: string; name: string }> = {
  bronze: {
    frame: 'from-[#4a3527] to-[#2a2018] border-[#6b4d38]',
    label: 'text-[#c89b74]',
    name: 'Бронза',
  },
  silver: {
    frame: 'from-[#3a3f47] to-[#22262c] border-[#5c646f]',
    label: 'text-[#b6bec9]',
    name: 'Серебро',
  },
  gold: {
    frame: 'from-[#54401d] to-[#2c2415] border-[#8a6a2c]',
    label: 'text-[#d9b365]',
    name: 'Золото',
  },
  special: {
    frame: 'from-[#1d2b2a] to-[#13191c] border-[#3f6b63]',
    label: 'text-[#79c0b0]',
    name: 'Особая',
  },
};

export function PlayerCard({ card }: { card: PersonCardType }) {
  const tier = TIER_STYLE[card.tier];
  // Считаем по всем оценкам, а не только по показанным шести: иначе на
  // странице человека карточка сообщала бы «4 предположения», а редактор
  // рядом — «6 из 10», и оба числа перестали бы что-либо значить.
  const rated = [...card.core, ...card.skills];
  const staleCount = rated.filter((a) => a.reliability.isStale).length;
  const assumingCount = rated.filter((a) => a.confidence === 'assuming').length;

  return (
    <Link
      to={`/person/${card.personId}`}
      className={`block rounded-xl border bg-gradient-to-br ${tier.frame} p-4 transition-transform hover:-translate-y-0.5`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-center">
          <div
            className={`tnum text-3xl font-bold leading-none ${
              card.ovr.value === null ? 'text-fg-faint' : 'text-fg'
            }`}
          >
            {card.ovr.value ?? '??'}
          </div>
          <div className={`eyebrow mt-1 ${tier.label}`}>
            {card.specializationName?.slice(0, 3).toUpperCase() ?? '—'}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold tracking-tight">
            {card.fullName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-fg-faint">
            <span className={tier.label}>{card.gradeName ?? 'без грейда'}</span>
            <span>{card.specializationName ?? 'без специализации'}</span>
          </div>
        </div>

        <Avatar
          fullName={card.fullName}
          photoPath={card.photoPath}
          size={52}
          className="ring-1 ring-white/10"
        />
      </div>

      {card.assessmentsHidden ? (
        // Различать «скрыто» и «не оценено» обязательно: иначе карточка
        // сообщила бы «оценено 0 из 6», то есть соврала бы.
        <p className="mt-3 rounded-lg border border-dashed border-warning/40 px-3 py-2.5 text-[12px] leading-snug text-warning/80">
          Оценки скрыты режимом показа экрана.
        </p>
      ) : card.ovr.value === null ? (
        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-2.5 text-[12px] leading-snug text-fg-faint">
          Оценено {card.ovr.assessed} из {card.ovr.total}. Общий уровень
          появится, когда будут все — частичный показывал бы неправду.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-1.5">
            {card.core.map((attribute) => (
              <AttributeStat key={attribute.attributeId} attribute={attribute} />
            ))}
          </ul>

          <div className="mt-3 border-t border-white/5 pt-2.5">
            {card.gradeMatch !== null && (
              <div className="flex items-center gap-2">
                <span className="eyebrow shrink-0">до уровня</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-black/30">
                  <span
                    className="block h-full rounded-full bg-current opacity-70"
                    style={{ width: `${Math.round(card.gradeMatch * 100)}%` }}
                  />
                </span>
                <span className="tnum shrink-0 text-[11px] text-fg-dim">
                  {Math.round(card.gradeMatch * 100)}%
                </span>
              </div>
            )}

            {card.nextGrade && card.nextGrade.gaps.length > 0 && (
              <p className="mt-1.5 text-[11.5px] leading-snug text-fg-faint">
                до {card.nextGrade.name}:{' '}
                {card.nextGrade.gaps
                  .map((gap) =>
                    gap.actual === null
                      ? `${gap.name} — не оценено`
                      : `${gap.name} ${gap.actual}→${gap.expected}`,
                  )
                  .join(' · ')}
              </p>
            )}
          </div>
        </>
      )}

      {(staleCount > 0 || assumingCount > 0) && (
        <p className="mt-2 text-[11px] text-warning/80">
          {staleCount > 0 && `${staleCount} оценок устарели`}
          {staleCount > 0 && assumingCount > 0 && ' · '}
          {assumingCount > 0 && `${assumingCount} — предположения`}
        </p>
      )}
    </Link>
  );
}

function AttributeStat({ attribute }: { attribute: ScoredAttributeType }) {
  const display =
    attribute.value === null
      ? '—'
      : Math.round(39 + ((attribute.value - 1) / 4) * 60);

  const meetsExpectation =
    attribute.expected === null ||
    attribute.value === null ||
    attribute.value >= attribute.expected;

  return (
    <li className="flex items-baseline gap-1.5" title={attribute.name}>
      <span
        className={`tnum text-[15px] font-semibold ${
          meetsExpectation ? 'text-fg' : 'text-critical'
        } ${
          // Предположение показывается пунктиром: это оценка, в которой сам
          // не уверен, и она не должна выглядеть как факт.
          attribute.confidence === 'assuming'
            ? 'underline decoration-dotted underline-offset-4 opacity-70'
            : ''
        }`}
      >
        {display}
      </span>
      <span className="eyebrow">{attribute.shortCode}</span>
    </li>
  );
}
