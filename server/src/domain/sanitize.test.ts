import { describe, expect, it } from 'vitest';

import { sanitizeForPresentation } from './sanitize.js';

const noteBlock = (kind: string, isSensitive = false) => ({
  id: 1,
  personId: 7,
  kind,
  content: 'секретный текст',
  value: 'высокий',
  reviewAt: '2026-11-19',
  confirmedAt: '2026-08-21',
  isSensitive,
});

const alert = (type: string) => ({
  key: `${type}:person:7`,
  type,
  severity: 'critical',
  personId: 7,
  title: 'Высокий риск ухода, а встречи не было две недели',
  detail: null,
});

describe('блоки заметок', () => {
  it('вырезает риск ухода и демотиваторы всегда', () => {
    const blocks = sanitizeForPresentation([
      noteBlock('flight_risk'),
      noteBlock('demotivators'),
      noteBlock('career_goal'),
      noteBlock('motivators'),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['career_goal', 'motivators']);
  });

  it('вырезает любой блок с пометкой чувствительности', () => {
    const blocks = sanitizeForPresentation([noteBlock('career_goal', true)]);
    expect(blocks).toEqual([]);
  });
});

describe('производные данные — главная утечка', () => {
  it('вырезает алерты, пересказывающие чувствительное в заголовке', () => {
    // Вырезать блок «риск ухода» и оставить алерт «Высокий риск ухода»
    // означает не спрятать ничего.
    const alerts = sanitizeForPresentation([
      alert('flight_risk_high'),
      alert('climate_drop'),
      alert('climate_low_sustained'),
      alert('burnout_risk'),
      alert('commitment_overdue_mine'),
      alert('one_on_one_overdue'),
    ]);
    expect(alerts.map((a) => a.type)).toEqual([
      'commitment_overdue_mine',
      'one_on_one_overdue',
    ]);
  });

  it('вырезает чувствительные пункты повестки', () => {
    const agenda = sanitizeForPresentation([
      { text: 'Он обещал: дописать доки', isSensitive: false },
      { text: 'Пора пересмотреть: риск ухода', isSensitive: true },
    ]);
    expect(agenda).toHaveLength(1);
    expect(agenda[0]?.text).toContain('доки');
  });

  it('вырезает средние по климату, а не только сами замеры', () => {
    // Оставить агрегат, вырезав замеры, — значит спрятать частное и
    // показать общее: «средняя мотивация команды 2.4» бьёт не слабее.
    const clean = sanitizeForPresentation({
      teamClimate: {
        measuredPeople: 11,
        totalPeople: 12,
        axes: [{ key: 'motivation', average: 2.4, distribution: [3, 4, 2, 1, 1] }],
      },
    });
    expect(clean.teamClimate).toBeUndefined();
  });

  it('вырезает замеры климата — это приватная оценка лида', () => {
    const checkins = sanitizeForPresentation([
      { id: 1, personId: 7, measuredAt: '2026-08-01', motivation: 2, workloadPressure: 5, satisfaction: 2 },
    ]);
    expect(checkins).toEqual([]);
  });
});

describe('описания блоков', () => {
  it('вырезает описания чувствительных блоков, а не только содержимое', () => {
    // Пустой слот «Риск ухода» выдаёт, что риск отслеживается, и — хуже —
    // приглашает записать в него текст поверх скрытого.
    const specs = sanitizeForPresentation([
      { kind: 'career_goal', title: 'Куда он хочет', isSensitiveByDefault: false },
      { kind: 'flight_risk', title: 'Риск ухода', isSensitiveByDefault: true },
      { kind: 'demotivators', title: 'Что демотивирует', isSensitiveByDefault: true },
    ]);
    expect(specs.map((s) => s.kind)).toEqual(['career_goal']);
  });
});

describe('карточки оценок', () => {
  const card = {
    personId: 1,
    fullName: 'Артём Ковалёв',
    gradeName: 'Senior',
    tier: 'gold',
    ovr: { value: 82, assessed: 6, total: 6 },
    core: [{ attributeId: 1, value: 4, evidence: 'Вытянул миграцию в одиночку' }],
    skills: [],
    pastExperience: [],
    gradeMatch: 0.91,
    nextGrade: { name: 'Lead', match: 0.7, gaps: [] },
    currentGaps: [],
  };

  it('прячет баллы, но оставляет личность и грейд', () => {
    // Прятать матрицу Skill × Will и оставлять оценки, из которых она
    // считается, — та же утечка на шаг назад.
    const clean = sanitizeForPresentation(card);

    expect(clean.fullName).toBe('Артём Ковалёв');
    expect(clean.gradeName).toBe('Senior');
    expect(clean.ovr.value).toBeNull();
    expect(clean.core).toEqual([]);
    expect(clean.gradeMatch).toBeNull();
    expect(clean.nextGrade).toBeNull();
  });

  it('помечает, что оценки именно скрыты, а не отсутствуют', () => {
    // Без флага карточка сказала бы «оценено 0 из 6» — то есть соврала бы.
    // Приведение типа здесь неизбежно: санитайзер объявлен как T → T, а для
    // карточки он добавляет поле, которого во входной форме нет.
    const clean = sanitizeForPresentation(card) as typeof card & {
      assessmentsHidden?: boolean;
    };
    expect(clean.assessmentsHidden).toBe(true);
  });

  it('не оставляет обоснований в сериализованном ответе', () => {
    expect(JSON.stringify(sanitizeForPresentation(card))).not.toContain('миграцию');
  });
});

describe('встречи', () => {
  it('прячет содержание чувствительной встречи, но не сам факт', () => {
    // Убрать встречу целиком нельзя: без неё каденция на экране выглядит
    // сломанной, а секрет — содержание, а не факт разговора.
    const [meeting] = sanitizeForPresentation([
      {
        id: 3,
        personId: 7,
        happenedAt: '2026-08-06',
        status: 'done',
        notes: 'Жаловался на коллегу',
        agenda: 'конфликт',
        isSensitive: true,
      },
    ]);
    expect(meeting?.happenedAt).toBe('2026-08-06');
    expect(meeting?.status).toBe('done');
    expect(meeting?.notes).toBeNull();
    expect(meeting?.agenda).toBeNull();
  });

  it('обычную встречу не трогает', () => {
    const [meeting] = sanitizeForPresentation([
      {
        id: 4,
        personId: 7,
        happenedAt: '2026-08-06',
        status: 'done',
        notes: 'Обсудили проект',
        agenda: null,
        isSensitive: false,
      },
    ]);
    expect(meeting?.notes).toBe('Обсудили проект');
  });
});

describe('отсутствия', () => {
  it('оставляет факт отсутствия, но обобщает его причину', () => {
    // Календарь без отсутствий бесполезен, а «больничный» — медицинская
    // информация: факт не секрет, причина — секрет.
    const [item] = sanitizeForPresentation([
      {
        id: 1,
        personId: 7,
        fromDay: '2026-09-01',
        toDay: '2026-09-14',
        kind: 'больничный',
        note: 'операция',
      },
    ]);
    expect(item?.fromDay).toBe('2026-09-01');
    expect(item?.toDay).toBe('2026-09-14');
    expect(item?.kind).toBe('отсутствие');
    expect(item?.note).toBeNull();
  });
});

describe('связи', () => {
  it('вырезает напряжения', () => {
    const relations = sanitizeForPresentation([
      { id: 1, fromPersonId: 1, toPersonId: 2, kind: 'tension', isSensitive: true },
      { id: 2, fromPersonId: 1, toPersonId: 3, kind: 'mentorship', isSensitive: false },
    ]);
    expect(relations.map((r) => r.kind)).toEqual(['mentorship']);
  });
});

describe('что остаётся видимым', () => {
  it('не трогает карму — она положительная по определению', () => {
    const karma = [
      { id: 1, personId: 7, category: 'инициатива', description: 'Собрал прототип', happenedAt: '2026-08-01' },
    ];
    expect(sanitizeForPresentation(karma)).toEqual(karma);
  });

  it('не трогает обязательства и людей', () => {
    const payload = {
      people: [{ id: 1, fullName: 'Павел Ершов', cadenceDays: 21 }],
      commitments: [
        { id: 1, personId: 1, direction: 'i_owe', title: 'Дать доступ', status: 'open' },
      ],
    };
    expect(sanitizeForPresentation(payload)).toEqual(payload);
  });
});

describe('обход структуры', () => {
  it('работает на любой вложенности, а не только на верхнем уровне', () => {
    const payload = {
      person: { id: 7, fullName: 'Павел' },
      noteBlocks: [noteBlock('flight_risk'), noteBlock('career_goal')],
      nested: { deep: { alerts: [alert('flight_risk_high'), alert('one_on_one_overdue')] } },
    };
    const clean = sanitizeForPresentation(payload);

    expect(clean.noteBlocks).toHaveLength(1);
    expect(clean.nested.deep.alerts).toHaveLength(1);
    expect(clean.person.fullName).toBe('Павел');
  });

  it('не ломается на null, примитивах и пустых массивах', () => {
    expect(sanitizeForPresentation(null)).toBeNull();
    expect(sanitizeForPresentation({ a: 1, b: 'x', c: null, d: [] })).toEqual({
      a: 1,
      b: 'x',
      c: null,
      d: [],
    });
  });

  it('не оставляет чувствительного текста нигде в сериализованном ответе', () => {
    // Проверка не по полям, а по итоговой строке: именно её увидит тот,
    // кто откроет вкладку Network на общем экране.
    const payload = {
      blocks: [noteBlock('flight_risk')],
      alerts: [alert('flight_risk_high')],
      checkins: [{ personId: 7, motivation: 1, workloadPressure: 5, satisfaction: 1 }],
    };
    const serialized = JSON.stringify(sanitizeForPresentation(payload));

    expect(serialized).not.toContain('секретный текст');
    expect(serialized).not.toContain('риск ухода');
    expect(serialized).not.toContain('workloadPressure');
  });

  describe('косяки', () => {
    /**
     * Решение принято сознательно: косяк — факт о событии, которое человек
     * и сам помнит, в отличие от риска ухода и демотиваторов, где прячется
     * твоя догадка о нём. Тест закрепляет выбор, чтобы он не отменился
     * случайно при следующей правке санитайзера.
     */
    it('записи не вырезаются — показ честный в обе стороны', () => {
      const result = sanitizeForPresentation({
        issues: [
          { id: 1, description: 'уронил прод', happenedAt: '2026-08-01', discussedAt: null },
        ],
      }) as { issues: unknown[] };
      expect(result.issues).toHaveLength(1);
    });

    it('сводка со счётчиками тоже остаётся', () => {
      const summary = { open: [], recent: [], olderCount: 4, total: 7 };
      expect(sanitizeForPresentation(summary)).toEqual(summary);
    });

    it('пункт повестки про косяк остаётся', () => {
      const result = sanitizeForPresentation({
        suggestedAgenda: [{ text: 'Разобрать: уронил прод', isSensitive: false }],
      }) as { suggestedAgenda: unknown[] };
      expect(result.suggestedAgenda).toHaveLength(1);
    });
  });
});
