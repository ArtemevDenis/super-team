import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

import { today } from '../domain/dates.js';
import {
  NOTE_BLOCK_SPECS,
  specFor,
  type NoteBlockKindType,
} from '../domain/note-blocks.js';
import * as notes from '../repositories/note-blocks.js';
import {
  isPresentationMode,
  presentationModeMiddleware,
  setPresentationMode,
} from './presentation-mode.js';
import { requireContext } from '../auth/context.js';
import { ownershipMiddleware, ownsAlertKey } from './ownership.js';
import * as assess from '../repositories/assessments.js';
import {
  buildCalendar,
  buildDashboard,
  buildTeamClimate,
} from '../repositories/dashboard.js';
import { buildTeamKarma } from '../repositories/karma.js';
import * as categories from '../repositories/karma-categories.js';
import * as issuesRepo from '../repositories/issues.js';
import * as meetings from '../repositories/meetings.js';
import * as peopleRepo from '../repositories/people.js';
import * as photos from '../repositories/photos.js';
import { getPersonContext } from '../repositories/person-context.js';
import * as reference from '../repositories/reference.js';
import * as settingsRepo from '../repositories/settings.js';
import * as teamsRepo from '../repositories/teams.js';
import * as todosRepo from '../repositories/todos.js';
import {
  archivePersonSchema,
  bulkAssessmentSchema,
  createAttributeSchema,
  createTeamSchema,
  createTodoSchema,
  createAbsenceSchema,
  createCommitmentSchema,
  createDepartmentSchema,
  createGradeSchema,
  createIssueSchema,
  createKarmaSchema,
  createPersonSchema,
  createSpecializationSchema,
  enabledAlertsSchema,
  gradeExpectationSchema,
  karmaCategorySchema,
  muteAlertSchema,
  photoSchema,
  planMeetingSchema,
  presentationModeSchema,
  removeGradeExpectationSchema,
  reorderAttributesSchema,
  reorderTodosSchema,
  saveAssessmentSchema,
  saveNoteBlockSchema,
  saveOneOnOneSchema,
  updateAbsenceSchema,
  updateDepartmentSchema,
  updateGradeSchema,
  updateSpecializationSchema,
  updateAttributeSchema,
  updateTeamSchema,
  updateTodoSchema,
  updateCommitmentSchema,
  updateIssueSchema,
  updateKarmaCategorySchema,
  updatePersonSchema,
} from './schemas.js';

export const api = Router();

// Ставится первым: всё, что ниже, отдаёт ответы уже через санитайзер.
api.use(presentationModeMiddleware);
api.use(ownershipMiddleware);

api.get('/presentation-mode', (_req, res) => {
  res.json({ enabled: isPresentationMode() });
});

api.post('/presentation-mode', (req, res) => {
  const { enabled } = parse(presentationModeSchema, req.body);
  setPresentationMode(enabled, requireContext().userId);
  res.json({ enabled: isPresentationMode() });
});

function parse<T>(schema: ZodSchema<T>, payload: unknown): T {
  return schema.parse(payload);
}

function numericParam(req: Request, name: string): number {
  const value = Number(req.params[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw Object.assign(new Error(`Некорректный ${name}`), { status: 400 });
  }
  return value;
}

function notFound(res: Response): void {
  res.status(404).json({ error: 'Не найдено' });
}

/* ------------------------------ команды ------------------------------ */

api.get('/teams', (_req, res) => {
  res.json({
    teams: teamsRepo.listTeams().map((team) => ({
      ...team,
      usage: teamsRepo.teamUsage(team.id),
    })),
    activeId: teamsRepo.currentTeamId(),
  });
});

api.post('/teams', (req, res) => {
  const input = parse(createTeamSchema, req.body);
  res.status(201).json(teamsRepo.createTeam(input));
});

api.patch('/teams/:id', (req, res) => {
  const updated = teamsRepo.updateTeam(
    numericParam(req, 'id'),
    parse(updateTeamSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/teams/:id', (req, res) => {
  res.json(teamsRepo.removeTeam(numericParam(req, 'id')));
});

api.post('/teams/:id/activate', (req, res) => {
  const id = numericParam(req, 'id');
  // Без этой проверки чужую команду можно было бы сделать активной прямым
  // запросом — и весь остальной API честно отдал бы её данные.
  if (!teamsRepo.ownsTeam(id)) return notFound(res);

  teamsRepo.setActiveTeam(id);
  res.json({ activeId: id });
});

/* ------------------------------ дашборд ------------------------------ */

api.get('/dashboard', (_req, res) => {
  res.json(buildDashboard());
});

api.get('/calendar', (req, res) => {
  const windowDays = req.query.days ? Number(req.query.days) : undefined;
  res.json(buildCalendar(windowDays));
});

api.get('/team-climate', (_req, res) => {
  res.json(buildTeamClimate());
});

api.get('/today', (_req, res) => {
  res.json({ today: today() });
});

/* ----------------------------- справочники ---------------------------- */

api.get('/reference', (req, res) => {
  const includeHidden = req.query.includeHidden === 'true';
  res.json({
    departments: reference
      .listDepartments(includeHidden)
      .map((d) => ({ ...d, usage: reference.departmentUsage(d.id) })),
    specializations: reference
      .listSpecializations(includeHidden)
      .map((s) => ({ ...s, usage: reference.specializationUsage(s.id) })),
    grades: reference.listGrades(),
  });
});

api.post('/departments', (req, res) => {
  res.status(201).json(reference.createDepartment(parse(createDepartmentSchema, req.body)));
});

api.patch('/departments/:id', (req, res) => {
  const updated = reference.updateDepartment(
    numericParam(req, 'id'),
    parse(updateDepartmentSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/departments/:id', (req, res) => {
  const result = reference.removeDepartment(numericParam(req, 'id'));
  if (!result) return notFound(res);
  res.json(result);
});

api.post('/specializations', (req, res) => {
  res
    .status(201)
    .json(reference.createSpecialization(parse(createSpecializationSchema, req.body)));
});

api.patch('/specializations/:id', (req, res) => {
  const updated = reference.updateSpecialization(
    numericParam(req, 'id'),
    parse(updateSpecializationSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/specializations/:id', (req, res) => {
  const result = reference.removeSpecialization(numericParam(req, 'id'));
  if (!result) return notFound(res);
  res.json(result);
});

api.post('/grades', (req, res) => {
  res.status(201).json(reference.createGrade(parse(createGradeSchema, req.body)));
});

api.patch('/grades/:id', (req, res) => {
  const updated = reference.updateGrade(
    numericParam(req, 'id'),
    parse(updateGradeSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

/* -------------------------------- люди -------------------------------- */

api.get('/people', (req, res) => {
  const kind = req.query.kind === 'peer' || req.query.kind === 'member'
    ? req.query.kind
    : undefined;
  res.json(peopleRepo.listPeople(req.query.includeArchived === 'true', kind));
});

api.post('/people', (req, res) => {
  res.status(201).json(peopleRepo.createPerson(parse(createPersonSchema, req.body)));
});

api.get('/people/:id', (req, res) => {
  const person = peopleRepo.getPerson(numericParam(req, 'id'));
  if (!person) return notFound(res);
  res.json(person);
});

api.patch('/people/:id', (req, res) => {
  const updated = peopleRepo.updatePerson(
    numericParam(req, 'id'),
    parse(updatePersonSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.post('/people/:id/archive', (req, res) => {
  const archived = peopleRepo.archivePerson(
    numericParam(req, 'id'),
    parse(archivePersonSchema, req.body ?? {}),
  );
  if (!archived) return notFound(res);
  res.json(archived);
});

api.post('/people/:id/restore', (req, res) => {
  const restored = peopleRepo.restorePerson(numericParam(req, 'id'));
  if (!restored) return notFound(res);
  res.json(restored);
});

api.put('/people/:id/photo', (req, res) => {
  const input = parse(photoSchema, req.body);
  res.json(photos.savePhoto(numericParam(req, 'id'), input.dataUrl));
});

api.delete('/people/:id/photo', (req, res) => {
  photos.deletePhoto(numericParam(req, 'id'));
  res.status(204).end();
});

/** Контекст для формы 1-1 и для экрана подготовки — один и тот же. */
api.get('/people/:id/context', (req, res) => {
  const context = getPersonContext(numericParam(req, 'id'));
  if (!context) return notFound(res);
  res.json(context);
});

api.get('/people/:id/timeline', (req, res) => {
  const id = numericParam(req, 'id');
  res.json({
    oneOnOnes: meetings.listOneOnOnes(id),
    commitments: meetings.listCommitments(id),
    checkins: meetings.listCheckins(id),
    karma: meetings.listKarma(id),
    events: peopleRepo.listPersonEvents(id),
    absences: peopleRepo.listAbsences(id),
  });
});

/* ------------------------------- оценки ------------------------------ */

api.get('/attributes', (req, res) => {
  const list = assess.listAttributes(req.query.includeInactive === 'true');
  // Использование отдаётся вместе со списком: без него настройки не могут
  // предупредить, что удаление затронет накопленные оценки.
  res.json(
    list.map((attribute) => ({
      ...attribute,
      usage: assess.attributeUsage(attribute.id),
    })),
  );
});

api.post('/attributes', (req, res) => {
  res.status(201).json(assess.createAttribute(parse(createAttributeSchema, req.body)));
});

api.patch('/attributes/:id', (req, res) => {
  const updated = assess.updateAttribute(
    numericParam(req, 'id'),
    parse(updateAttributeSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/attributes/:id', (req, res) => {
  const result = assess.removeAttribute(numericParam(req, 'id'));
  if (!result) return notFound(res);
  res.json(result);
});

api.post('/attributes/reorder', (req, res) => {
  assess.reorderAttributes(parse(reorderAttributesSchema, req.body).ids);
  res.status(204).end();
});

api.get('/cards', (_req, res) => {
  res.json(assess.listTeamCards());
});

api.get('/people/:id/card', (req, res) => {
  const card = assess.buildPersonCard(numericParam(req, 'id'));
  if (!card) return notFound(res);
  res.json(card);
});

api.post('/people/:id/assessments', (req, res) => {
  const input = parse(saveAssessmentSchema, req.body);
  res
    .status(201)
    .json(assess.saveAssessment({ ...input, personId: numericParam(req, 'id') }));
});

api.post('/people/:id/assessments/bulk', (req, res) => {
  const input = parse(bulkAssessmentSchema, req.body);
  const saved = assess.saveAssessments(numericParam(req, 'id'), input.items);
  res.status(201).json({ saved });
});

api.get('/people/:id/assessments', (req, res) => {
  const attributeId = req.query.attributeId
    ? Number(req.query.attributeId)
    : undefined;
  res.json(assess.listAssessmentHistory(numericParam(req, 'id'), attributeId));
});

api.delete('/assessments/:id', (req, res) => {
  assess.deleteAssessment(numericParam(req, 'id'));
  res.status(204).end();
});

api.get('/grade-expectations', (_req, res) => {
  res.json(assess.listGradeExpectations());
});

api.put('/grade-expectations', (req, res) => {
  const input = parse(gradeExpectationSchema, req.body);
  assess.setGradeExpectation(input.gradeId, input.attributeId, input.expectedValue);
  res.json(assess.listGradeExpectations());
});

api.delete('/grade-expectations', (req, res) => {
  const input = parse(removeGradeExpectationSchema, req.body);
  assess.removeGradeExpectation(input.gradeId, input.attributeId);
  res.json(assess.listGradeExpectations());
});

/* --------------------------- блоки заметок --------------------------- */

api.get('/note-block-specs', (_req, res) => {
  res.json(NOTE_BLOCK_SPECS);
});

api.get('/people/:id/note-blocks', (req, res) => {
  res.json(notes.listNoteBlocks(numericParam(req, 'id')));
});

/** Один блок каждого вида на человека, поэтому PUT, а не POST. */
api.put('/people/:id/note-blocks', (req, res) => {
  const input = parse(saveNoteBlockSchema, req.body);

  // Защита от записи вслепую: в режиме показа содержимое скрыто, и любая
  // запись сюда затёрла бы то, чего автор сейчас не видит. Интерфейс такие
  // блоки не показывает, но забытая вкладка — показывает.
  if (isPresentationMode() && specFor(input.kind)?.isSensitiveByDefault) {
    throw Object.assign(
      new Error('Этот блок скрыт режимом показа — выключи его, чтобы менять'),
      { status: 409 },
    );
  }

  res.json(notes.saveNoteBlock({ ...input, personId: numericParam(req, 'id') }));
});

api.post('/people/:id/note-blocks/:kind/confirm', (req, res) => {
  const kind = req.params.kind as NoteBlockKindType;
  if (!specFor(kind)) return notFound(res);

  const confirmed = notes.confirmNoteBlock(numericParam(req, 'id'), kind);
  if (!confirmed) return notFound(res);
  res.json(confirmed);
});

api.delete('/people/:id/note-blocks/:kind', (req, res) => {
  const kind = req.params.kind as NoteBlockKindType;
  if (!specFor(kind)) return notFound(res);

  notes.deleteNoteBlock(numericParam(req, 'id'), kind);
  res.status(204).end();
});

/* ------------------------------- встречи ------------------------------ */

api.post('/people/:id/one-on-ones', (req, res) => {
  const personId = numericParam(req, 'id');
  const input = parse(saveOneOnOneSchema, req.body);
  res.status(201).json(meetings.saveOneOnOne({ ...input, personId }));
});

/** Путь на одну секунду прямо из алерта: «провёл ✓», ничего не заполняя. */
api.post('/people/:id/one-on-ones/quick', (req, res) => {
  res.status(201).json(meetings.quickMarkDone(numericParam(req, 'id')));
});

api.post('/one-on-ones/:id/skip', (req, res) => {
  const skipped = meetings.markSkipped(numericParam(req, 'id'));
  if (!skipped) return notFound(res);
  res.json(skipped);
});

api.delete('/one-on-ones/:id', (req, res) => {
  meetings.deleteOneOnOne(numericParam(req, 'id'));
  res.status(204).end();
});

api.post('/one-on-ones/plan', (req, res) => {
  const input = parse(planMeetingSchema, req.body);
  res.status(201).json(meetings.planOneOnOne(input.personId, input.plannedAt));
});

/* ---------------------------- обязательства --------------------------- */

api.get('/commitments', (req, res) => {
  const personId = req.query.personId ? Number(req.query.personId) : undefined;
  res.json(meetings.listOpenCommitments(personId));
});

api.post('/commitments', (req, res) => {
  res.status(201).json(meetings.createCommitment(parse(createCommitmentSchema, req.body)));
});

api.patch('/commitments/:id', (req, res) => {
  const updated = meetings.updateCommitment(
    numericParam(req, 'id'),
    parse(updateCommitmentSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/commitments/:id', (req, res) => {
  meetings.deleteCommitment(numericParam(req, 'id'));
  res.status(204).end();
});

api.get('/commitments/mine', (_req, res) => {
  res.json(meetings.listMyOpenCommitments());
});

/* -------------------------------- дела -------------------------------- */

api.get('/todos', (_req, res) => {
  res.json(todosRepo.listTodos());
});

api.post('/todos', (req, res) => {
  res.status(201).json(todosRepo.createTodo(parse(createTodoSchema, req.body)));
});

// Объявлены до /todos/:id, иначе «reorder» и «completed» ушли бы в параметр.
api.post('/todos/reorder', (req, res) => {
  todosRepo.reorderTodos(parse(reorderTodosSchema, req.body).ids);
  res.status(204).end();
});

api.delete('/todos/completed', (_req, res) => {
  res.json({ removed: todosRepo.clearCompleted() });
});

api.patch('/todos/:id', (req, res) => {
  const updated = todosRepo.updateTodo(numericParam(req, 'id'), parse(updateTodoSchema, req.body));
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/todos/:id', (req, res) => {
  if (!todosRepo.removeTodo(numericParam(req, 'id'))) return notFound(res);
  res.status(204).end();
});

/* -------------------------------- карма ------------------------------- */

/* ------------------------------- косяки ------------------------------- */

api.get('/people/:id/issues', (req, res) => {
  res.json(issuesRepo.issueSummary(numericParam(req, 'id')));
});

api.post('/issues', (req, res) => {
  const created = issuesRepo.createIssue(parse(createIssueSchema, req.body));
  if (!created) return notFound(res);
  res.status(201).json(created);
});

api.patch('/issues/:id', (req, res) => {
  const updated = issuesRepo.updateIssue(
    numericParam(req, 'id'),
    parse(updateIssueSchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/issues/:id', (req, res) => {
  if (!issuesRepo.removeIssue(numericParam(req, 'id'))) return notFound(res);
  res.status(204).end();
});

api.get('/karma', (req, res) => {
  const personId = req.query.personId ? Number(req.query.personId) : undefined;
  res.json(meetings.listKarma(personId));
});

/** Сводка по всей команде: сколько у кого и кого лид не отмечал вовсе. */
api.get('/karma/summary', (req, res) => {
  const windowDays = req.query.windowDays ? Number(req.query.windowDays) : undefined;
  res.json(buildTeamKarma(windowDays));
});

api.post('/karma', (req, res) => {
  const input = parse(createKarmaSchema, req.body);
  if (!categories.isKnownCategory(input.category)) {
    throw Object.assign(new Error('Такой категории нет'), { status: 400 });
  }
  res.status(201).json(meetings.createKarma(input));
});

/* -------------------------- категории кармы -------------------------- */

api.get('/karma-categories', (req, res) => {
  res.json(categories.listKarmaCategories(req.query.includeHidden === 'true'));
});

api.post('/karma-categories', (req, res) => {
  res.status(201).json(categories.createKarmaCategory(parse(karmaCategorySchema, req.body)));
});

api.patch('/karma-categories/:id', (req, res) => {
  const updated = categories.updateKarmaCategory(
    numericParam(req, 'id'),
    parse(updateKarmaCategorySchema, req.body),
  );
  if (!updated) return notFound(res);
  res.json(updated);
});

api.delete('/karma-categories/:id', (req, res) => {
  const result = categories.removeKarmaCategory(numericParam(req, 'id'));
  if (!result) return notFound(res);
  res.json(result);
});

api.delete('/karma/:id', (req, res) => {
  meetings.deleteKarma(numericParam(req, 'id'));
  res.status(204).end();
});

/* ----------------------------- отсутствия ----------------------------- */

api.get('/absences', (req, res) => {
  const personId = req.query.personId ? Number(req.query.personId) : undefined;
  res.json(peopleRepo.listAbsences(personId));
});

api.post('/absences', (req, res) => {
  res.status(201).json(peopleRepo.createAbsence(parse(createAbsenceSchema, req.body)));
});

api.patch('/absences/:id', (req, res) => {
  const id = numericParam(req, 'id');
  const input = parse(updateAbsenceSchema, req.body);

  // Частичная правка: одну дату можно менять, не присылая вторую, поэтому
  // порядок проверяется против того, что уже лежит в базе.
  const current = peopleRepo.getAbsence(id);
  if (!current) return notFound(res);

  const fromDay = input.fromDay ?? current.fromDay;
  const toDay = input.toDay ?? current.toDay;
  if (fromDay > toDay) {
    throw Object.assign(new Error('Дата окончания раньше даты начала'), {
      status: 400,
    });
  }

  res.json(peopleRepo.updateAbsence(id, input));
});

api.delete('/absences/:id', (req, res) => {
  peopleRepo.deleteAbsence(numericParam(req, 'id'));
  res.status(204).end();
});

/* ------------------------------ настройки ----------------------------- */

api.get('/settings/alerts', (_req, res) => {
  res.json({
    enabled: settingsRepo.getEnabledAlerts(),
    mutes: settingsRepo.listAllMutes().filter((mute) => ownsAlertKey(mute.alertKey)),
  });
});

api.put('/settings/alerts', (req, res) => {
  const input = parse(enabledAlertsSchema, req.body);
  settingsRepo.setEnabledAlerts(input.types);
  res.json({ enabled: settingsRepo.getEnabledAlerts() });
});

api.post('/alerts/mute', (req, res) => {
  const input = parse(muteAlertSchema, req.body);
  if (!ownsAlertKey(input.alertKey)) return notFound(res);
  if (input.until) settingsRepo.muteAlertUntil(input.alertKey, input.until);
  else settingsRepo.muteAlert(input.alertKey, input.days ?? 7);
  res.status(204).end();
});

api.delete('/alerts/mute/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key ?? '');
  if (!ownsAlertKey(key)) return notFound(res);
  settingsRepo.unmuteAlert(key);
  res.status(204).end();
});

/* --------------------------- обработка ошибок -------------------------- */

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Некорректные данные',
      issues: error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return;
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : 500;

  const message = error instanceof Error ? error.message : 'Внутренняя ошибка';
  if (status >= 500) console.error(error);
  res.status(Number.isInteger(status) ? status : 500).json({ error: message });
}
