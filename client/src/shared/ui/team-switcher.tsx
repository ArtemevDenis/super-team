import { useState } from 'react';

import { useActivateTeam, useCreateTeam, useTeams } from '../api';
import { Button, TextInput } from './primitives';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];

/**
 * Переключатель команд.
 *
 * Команды изолированы полностью, поэтому переключение меняет всё: людей,
 * грейды, атрибуты, категории кармы, настройки сигналов. Цветная метка
 * рядом с названием — единственный постоянный признак того, в чьих данных
 * ты сейчас находишься.
 */
export function TeamSwitcher() {
  const { data } = useTeams();
  const activate = useActivateTeam();
  const create = useCreateTeam();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  if (!data) return null;

  const active = data.teams.find((team) => team.id === data.activeId);

  const add = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color: COLORS[data.teams.length % COLORS.length] },
      {
        onSuccess: (team) => {
          setName('');
          setAdding(false);
          setOpen(false);
          activate.mutate(team.id);
        },
      },
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px] transition-colors hover:border-fg-faint"
      >
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: active?.color ?? '#64748b' }}
        />
        <span className="max-w-40 truncate">{active?.name ?? 'Команда'}</span>
        <span className="text-fg-faint">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <>
          {/* Клик мимо закрывает: выпадашка перекрывает содержимое. */}
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />

          <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-line bg-raised p-1.5 shadow-xl">
            <ul>
              {data.teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => {
                      activate.mutate(team.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
                      team.id === data.activeId
                        ? 'bg-surface text-fg'
                        : 'text-fg-dim hover:bg-surface'
                    }`}
                  >
                    <span
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: team.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    <span className="tnum shrink-0 text-[11px] text-fg-faint">
                      {team.usage.people}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-1 border-t border-line pt-1.5">
              {adding ? (
                <div className="flex gap-1.5 px-1">
                  <TextInput
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') add();
                      if (e.key === 'Escape') setAdding(false);
                    }}
                    placeholder="Название команды"
                  />
                  <Button variant="solid" onClick={add} disabled={create.isPending}>
                    создать
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    variant="quiet"
                    onClick={() => setAdding(true)}
                    className="w-full justify-start"
                  >
                    + новая команда
                  </Button>
                  <p className="px-2.5 pb-1 pt-0.5 text-[11px] leading-relaxed text-fg-faint">
                    У новой команды свои грейды, атрибуты и категории кармы —
                    она заводится с набором по умолчанию.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
