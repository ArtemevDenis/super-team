import { describe, expect, it } from 'vitest';

import { NOTE_BLOCK_SPECS, noteBlockStaleness, specFor } from './note-blocks.js';

const TODAY = '2025-06-30';

describe('описания блоков', () => {
  it('риск ухода — перечисление, а не свободный текст', () => {
    // От этого значения зависит подъём просрочки 1-1 до критичной,
    // поэтому произвольная строка молча сломала бы движок алертов.
    expect(specFor('flight_risk')?.options).toEqual([
      'низкий',
      'средний',
      'высокий',
    ]);
  });

  it('чувствительные блоки помечены — их прячет режим шара экрана', () => {
    expect(specFor('flight_risk')?.isSensitiveByDefault).toBe(true);
    expect(specFor('demotivators')?.isSensitiveByDefault).toBe(true);
    expect(specFor('career_goal')?.isSensitiveByDefault).toBe(false);
  });

  it('у каждого блока есть срок пересмотра', () => {
    for (const spec of NOTE_BLOCK_SPECS) {
      expect(spec.reviewAfterDays).toBeGreaterThan(0);
    }
  });
});

describe('протухание блока', () => {
  it('пустой блок не считается просроченным', () => {
    expect(noteBlockStaleness(null, TODAY)).toEqual({
      isDue: false,
      daysOverdue: 0,
      ageDays: null,
    });
  });

  it('срок в будущем — блок свежий', () => {
    const state = noteBlockStaleness(
      { confirmedAt: '2025-06-01', reviewAt: '2025-09-01' },
      TODAY,
    );
    expect(state.isDue).toBe(false);
    expect(state.ageDays).toBe(29);
  });

  it('срок наступил сегодня — уже пора', () => {
    expect(
      noteBlockStaleness({ confirmedAt: '2025-01-01', reviewAt: TODAY }, TODAY).isDue,
    ).toBe(true);
  });

  it('считает, на сколько просрочен пересмотр', () => {
    const state = noteBlockStaleness(
      { confirmedAt: '2024-12-01', reviewAt: '2025-06-01' },
      TODAY,
    );
    expect(state.isDue).toBe(true);
    expect(state.daysOverdue).toBe(29);
  });

  it('возраст считается от подтверждения, а не от правки', () => {
    // Переподтверждение без изменения текста — полноценное событие:
    // иначе единственный способ снять просрочку — сделать вид,
    // что что-то поменял.
    const state = noteBlockStaleness(
      { confirmedAt: TODAY, reviewAt: '2025-12-27' },
      TODAY,
    );
    expect(state.ageDays).toBe(0);
    expect(state.isDue).toBe(false);
  });

  it('блок без срока пересмотра не протухает', () => {
    const state = noteBlockStaleness(
      { confirmedAt: '2020-01-01', reviewAt: null },
      TODAY,
    );
    expect(state.isDue).toBe(false);
    expect(state.ageDays).toBeGreaterThan(1000);
  });
});
