import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useCreatePerson } from '../api';
import { daysWord } from '../dates';
import { Avatar } from './avatar';
import { Button, Empty, Field, Panel, TextInput } from './primitives';
import type { PersonType } from '../types';

/**
 * Смежники — люди вне команды: PM, PO, лид соседней команды.
 *
 * У них нет оценок, грейдов и настроя: их не оценивают, с ними
 * договариваются. Раздел существует ради одного — не забыть, кто кому что
 * обещал, потому что обещание, данное смежнику, ломает доверие ровно так же,
 * как обещание своему.
 */
export function PeersSection({ peers }: { peers: PersonType[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <Panel
      title="Смежники"
      count={peers.length}
      action={
        <Button variant="quiet" onClick={() => setAdding((v) => !v)}>
          {adding ? 'свернуть' : 'добавить смежника'}
        </Button>
      }
    >
      <p className="mb-3 text-[12.5px] leading-relaxed text-fg-faint">
        Вне команды и не в подчинении. Только встречи, договорённости и
        заметки — без оценок, грейдов и замеров настроя.
      </p>

      {adding && <AddPeer onDone={() => setAdding(false)} />}

      {peers.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {peers.map((peer) => (
            <li key={peer.id}>
              <Link
                to={`/person/${peer.id}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 transition-colors hover:border-fg-faint"
              >
                <Avatar
                  fullName={peer.fullName}
                  photoPath={peer.photoPath}
                  size={36}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {peer.fullName}
                  </span>
                  <span className="block truncate text-[12px] text-fg-faint">
                    {peer.externalRole ?? 'без роли'}
                  </span>
                  <span className="tnum block text-[11px] text-fg-faint">
                    1-1 раз в {peer.cadenceDays} {daysWord(peer.cadenceDays)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        !adding && (
          <Empty>
            Никого нет. Сюда стоит завести тех, с кем ты договариваешься
            регулярно, но кто тебе не подчиняется.
          </Empty>
        )
      )}
    </Panel>
  );
}

function AddPeer({ onDone }: { onDone: () => void }) {
  const create = useCreatePerson();
  const [fullName, setFullName] = useState('');
  const [externalRole, setExternalRole] = useState('');
  const [cadenceDays, setCadenceDays] = useState('14');

  const submit = () => {
    if (!fullName.trim()) return;
    create.mutate(
      {
        fullName: fullName.trim(),
        kind: 'peer',
        externalRole: externalRole.trim() || null,
        cadenceDays: Number(cadenceDays) || 14,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="mb-3 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
      <Field label="Имя">
        <TextInput
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Имя и фамилия"
        />
      </Field>
      <Field label="Роль" hint="Он вне твоей структуры отделов">
        <TextInput
          value={externalRole}
          onChange={(e) => setExternalRole(e.target.value)}
          placeholder="PM продукта, дизайн-лид…"
        />
      </Field>
      <Field label="Синк раз в, дней">
        <div className="flex gap-2">
          <TextInput
            type="number"
            min={1}
            value={cadenceDays}
            onChange={(e) => setCadenceDays(e.target.value)}
          />
          <Button variant="solid" onClick={submit} disabled={create.isPending}>
            добавить
          </Button>
        </div>
      </Field>
    </div>
  );
}
