import type { NextFunction, Request, Response } from 'express';

import { requireContext } from '../auth/context.js';
import { sqlite } from '../db/index.js';
import { currentTeamId, ownsTeam } from '../repositories/teams.js';

/**
 * Проверка владения — одна на весь API, а не в каждом репозитории.
 *
 * Идентификаторы в базе сквозные. Пока проверка жила по репозиториям, её
 * сделали в трёх из двенадцати, и остальные по чужому id честно читали,
 * правили и удаляли данные другого пользователя: встречи, оценки, заметки,
 * обещания. Здесь же правило задано для ресурса целиком, и новый роут
 * попадает под него автоматически.
 *
 * Ресурс с числовым id, для которого правила нет, отклоняется: забыть
 * описать новую сущность должно быть заметно сразу, а не через утечку.
 */

type CheckType = (id: number) => boolean;

type RowType = { personId?: number; teamId?: number; userId?: number } | undefined;

export function ownsPerson(personId: number): boolean {
  const row = sqlite
    .prepare('SELECT team_id AS teamId FROM people WHERE id = ?')
    .get(personId) as RowType;
  return row?.teamId === currentTeamId();
}

/** Запись, принадлежащая человеку: владеет тот, чей это человек. */
const viaPerson =
  (table: string): CheckType =>
  (id) => {
    const row = sqlite
      .prepare(`SELECT person_id AS personId FROM ${table} WHERE id = ?`)
      .get(id) as RowType;
    return row?.personId !== undefined && ownsPerson(row.personId);
  };

/** Справочник команды: отделы, грейды, атрибуты, категории кармы. */
const viaTeam =
  (table: string): CheckType =>
  (id) => {
    const row = sqlite
      .prepare(`SELECT team_id AS teamId FROM ${table} WHERE id = ?`)
      .get(id) as RowType;
    return row?.teamId === currentTeamId();
  };

/** У специализации своей команды нет — она через отдел. */
const ownsSpecialization: CheckType = (id) => {
  const row = sqlite
    .prepare(
      `SELECT d.team_id AS teamId FROM specializations s
       JOIN departments d ON d.id = s.department_id WHERE s.id = ?`,
    )
    .get(id) as RowType;
  return row?.teamId === currentTeamId();
};

const ownsTodo: CheckType = (id) => {
  const row = sqlite.prepare('SELECT user_id AS userId FROM todos WHERE id = ?').get(id) as RowType;
  return row?.userId === requireContext().userId;
};

/** Первый сегмент пути → правило для id во втором сегменте. */
const RESOURCES: Record<string, CheckType> = {
  people: ownsPerson,
  teams: (id) => ownsTeam(id),
  commitments: viaPerson('commitments'),
  'one-on-ones': viaPerson('one_on_ones'),
  assessments: viaPerson('assessments'),
  karma: viaPerson('karma_entries'),
  absences: viaPerson('absences'),
  issues: viaPerson('issues'),
  todos: ownsTodo,
  attributes: viaTeam('attributes'),
  departments: viaTeam('departments'),
  grades: viaTeam('grades'),
  'karma-categories': viaTeam('karma_categories'),
  specializations: ownsSpecialization,
};

/** Поля тела и query, которые ссылаются на чужие сущности. */
const REFERENCES: Record<string, CheckType> = {
  personId: ownsPerson,
  fromPersonId: ownsPerson,
  toPersonId: ownsPerson,
  oneOnOneId: viaPerson('one_on_ones'),
  attributeId: viaTeam('attributes'),
  gradeId: viaTeam('grades'),
  departmentId: viaTeam('departments'),
  specializationId: ownsSpecialization,
};

const PATH_ID = /^\/([a-z-]+)\/(\d+)(?:\/|$)/;

/** Первая ссылка на чужое в теле запроса, на любой глубине. */
function findForeignReference(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForeignReference(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const check = REFERENCES[key];
    if (check && child !== null && child !== undefined) {
      const id = Number(child);
      if (!Number.isInteger(id) || !check(id)) return key;
    }
    const found = findForeignReference(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Чужое отвечает 404, а не 403: «есть, но не твоё» уже сообщает, что
 * такой id существует.
 */
export function ownershipMiddleware(req: Request, res: Response, next: NextFunction): void {
  const notFound = () => void res.status(404).json({ error: 'Не найдено' });

  const match = PATH_ID.exec(req.path);
  if (match) {
    const [, resource = '', rawId] = match;
    const check = RESOURCES[resource];
    if (!check) {
      next(new Error(`Нет правила владения для ресурса «${resource}»`));
      return;
    }
    if (!check(Number(rawId))) return notFound();
  }

  if (findForeignReference(req.query) || findForeignReference(req.body)) return notFound();

  next();
}

/** Ключ сигнала по человеку: `тип:person:<id>`. */
const PERSON_ALERT_KEY = /:person:(\d+)$/;

export function ownsAlertKey(key: string): boolean {
  const match = PERSON_ALERT_KEY.exec(key);
  return match ? ownsPerson(Number(match[1])) : true;
}
