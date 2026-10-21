import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AbsenceCalendarType,
  AssessmentType,
  AttributeSettingType,
  DashboardType,
  GradeExpectationType,
  KarmaCategoryType,
  NoteBlockKindType,
  NoteBlockSpecType,
  PersonCardType,
  ScoredAttributeType,
  PersonContextType,
  PersonTimelineType,
  PersonType,
  ReferenceFullType,
  ReferenceType,
  StructureUsageType,
  TeamClimateType,
  TeamsResponseType,
  TeamType,
  TeamKarmaType,
  IssueSummaryType,
  MyCommitmentType,
  TodoType,
} from './types';

/**
 * Сессия истекла или её не было.
 *
 * Отдельный тип, а не текст ошибки: на 401 приложение обязано показать
 * вход, а не сообщение об ошибке в середине экрана — иначе выглядит как
 * поломка, хотя это просто закончился месяц.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super('Нужен вход');
    this.name = 'UnauthorizedError';
  }
}

/** Событие для тех, кто ждёт сессию: любой запрос может обнаружить её конец. */
export const AUTH_LOST_EVENT = 'td:auth-lost';

/**
 * На форме входа 401 значит «неверный пароль», а не «сессия кончилась».
 * Без этого исключения общий перехват съедал ответ сервера, и на неверный
 * пароль форма отвечала «Нужен вход».
 */
const LOGIN_PATH = '/auth/login';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });

  if (response.status === 401 && path !== LOGIN_PATH) {
    window.dispatchEvent(new Event(AUTH_LOST_EVENT));
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Запрос не прошёл (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

const del = (path: string) => request<void>(path, { method: 'DELETE' });

/* ------------------------------- запросы ------------------------------- */

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => request<TeamsResponseType>('/teams'),
  });
}

export function useCreateTeam() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { name: string; color?: string }) => post<TeamType>('/teams', body),
    onSuccess: invalidate,
  });
}

export function useActivateTeam() {
  return useMutation({
    mutationFn: (id: number) => post(`/teams/${id}/activate`),
    /**
     * Переход по адресу, а не сброс кэша.
     *
     * Первая версия делала clear() и следом invalidateQueries() — вывернутый
     * наизнанку порядок: clear вычищает кэш целиком, инвалидировать после
     * него нечего, и компоненты остаются с последними отрисованными данными.
     * Шапка показывала новую команду, страница — людей старой.
     *
     * Но и правильный сброс кэша здесь мало что решает: смена команды —
     * жёсткая граница. Пережить её не должно ничего: ни открытая форма
     * редактирования, ни фильтры в состоянии компонентов, ни черновики в
     * localStorage с идентификаторами чужих людей. И главное — текущий
     * адрес может указывать на /person/5, которого в новой команде нет.
     * Поэтому уходим на корень с полной перезагрузкой.
     */
    onSuccess: () => window.location.assign('/'),
  });
}

export function useDeleteTeam() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) =>
      request<{ deleted: boolean; reason?: string }>(`/teams/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => request<DashboardType>('/dashboard'),
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => request<PersonType[]>('/people'),
  });
}

export function usePerson(id: number) {
  return useQuery({
    queryKey: ['person', id],
    queryFn: () => request<PersonType>(`/people/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function usePersonContext(id: number) {
  return useQuery({
    queryKey: ['person-context', id],
    queryFn: () => request<PersonContextType>(`/people/${id}/context`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function usePersonTimeline(id: number) {
  return useQuery({
    queryKey: ['person-timeline', id],
    queryFn: () => request<PersonTimelineType>(`/people/${id}/timeline`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useTeamKarma() {
  return useQuery({
    queryKey: ['karma-summary'],
    queryFn: () => request<TeamKarmaType>('/karma/summary'),
  });
}

export function useUploadPhoto() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ personId, dataUrl }: { personId: number; dataUrl: string }) =>
      request<{ photoPath: string }>(`/people/${personId}/photo`, {
        method: 'PUT',
        body: JSON.stringify({ dataUrl }),
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePhoto() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (personId: number) => del(`/people/${personId}/photo`),
    onSuccess: invalidate,
  });
}

export function useCalendar() {
  return useQuery({
    queryKey: ['calendar'],
    queryFn: () => request<AbsenceCalendarType>('/calendar'),
  });
}

export function useTeamClimate() {
  return useQuery({
    queryKey: ['team-climate'],
    queryFn: () => request<TeamClimateType | null>('/team-climate'),
  });
}

export function useTeamCards() {
  return useQuery({
    queryKey: ['cards'],
    queryFn: () => request<PersonCardType[]>('/cards'),
  });
}

export function usePersonCard(id: number) {
  return useQuery({
    queryKey: ['card', id],
    queryFn: () => request<PersonCardType>(`/people/${id}/card`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useAttributes() {
  return useQuery({
    queryKey: ['attributes'],
    queryFn: () => request<ScoredAttributeType[]>('/attributes'),
    staleTime: 60_000,
  });
}

export function useAttributeSettings() {
  return useQuery({
    queryKey: ['attribute-settings'],
    queryFn: () =>
      request<AttributeSettingType[]>('/attributes?includeInactive=true'),
  });
}

export function useCreateAttribute() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: {
      name: string;
      shortCode: string;
      kind: 'core' | 'skill';
      specializationId?: number | null;
      axis?: 'skill' | 'will' | 'neutral';
      description?: string | null;
    }) => post('/attributes', body),
    onSuccess: invalidate,
  });
}

export function useUpdateAttribute() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      shortCode?: string;
      axis?: 'skill' | 'will' | 'neutral';
      description?: string | null;
      isActive?: boolean;
    }) => patch(`/attributes/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAttribute() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) =>
      request<{ deleted: boolean; hidden?: boolean; usage?: { assessments: number } }>(
        `/attributes/${id}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  });
}

export function useReorderAttributes() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { ids: number[] }) => post('/attributes/reorder', body),
    onSuccess: invalidate,
  });
}

export function useGradeExpectations() {
  return useQuery({
    queryKey: ['grade-expectations'],
    queryFn: () => request<GradeExpectationType[]>('/grade-expectations'),
  });
}

export function useSetGradeExpectation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: {
      gradeId: number;
      attributeId: number;
      expectedValue: number;
    }) => request('/grade-expectations', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useRemoveGradeExpectation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { gradeId: number; attributeId: number }) =>
      request('/grade-expectations', {
        method: 'DELETE',
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useAssessmentHistory(personId: number, attributeId?: number) {
  return useQuery({
    queryKey: ['assessments', personId, attributeId],
    queryFn: () =>
      request<AssessmentType[]>(
        `/people/${personId}/assessments${attributeId ? `?attributeId=${attributeId}` : ''}`,
      ),
    enabled: Number.isFinite(personId) && personId > 0,
  });
}

export function useBulkAssess() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      personId,
      items,
    }: {
      personId: number;
      items: {
        attributeId: number;
        value: number;
        confidence?: 'sure' | 'assuming';
        evidence?: string | null;
      }[];
    }) => post<{ saved: number }>(`/people/${personId}/assessments/bulk`, { items }),
    onSuccess: invalidate,
  });
}

export function useSaveAssessment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      personId,
      ...body
    }: {
      personId: number;
      attributeId: number;
      value: number;
      confidence?: 'sure' | 'assuming';
      evidence?: string | null;
    }) => post(`/people/${personId}/assessments`, body),
    onSuccess: invalidate,
  });
}

export function usePresentationMode() {
  return useQuery({
    queryKey: ['presentation-mode'],
    queryFn: () => request<{ enabled: boolean }>('/presentation-mode'),
    staleTime: 0,
  });
}

export function useSetPresentationMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => post('/presentation-mode', { enabled }),
    onSuccess: () => {
      /**
       * resetQueries, а не clear: он и выбрасывает данные, и перезапрашивает
       * активные запросы. Просто clear() оставил бы компоненты с уже
       * отрисованным чувствительным содержимым — то есть режим показа
       * включился бы только на бумаге.
       */
      void client.resetQueries();
    },
  });
}

export function useNoteBlockSpecs() {
  return useQuery({
    queryKey: ['note-block-specs'],
    queryFn: () => request<NoteBlockSpecType[]>('/note-block-specs'),
    staleTime: Infinity,
  });
}

export function useSaveNoteBlock() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      personId,
      ...body
    }: {
      personId: number;
      kind: NoteBlockKindType;
      content?: string | null;
      value?: string | null;
      isSensitive?: boolean;
    }) => request(`/people/${personId}/note-blocks`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    onSuccess: invalidate,
  });
}

export function useConfirmNoteBlock() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ personId, kind }: { personId: number; kind: NoteBlockKindType }) =>
      post(`/people/${personId}/note-blocks/${kind}/confirm`),
    onSuccess: invalidate,
  });
}

export function useDeleteNoteBlock() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ personId, kind }: { personId: number; kind: NoteBlockKindType }) =>
      del(`/people/${personId}/note-blocks/${kind}`),
    onSuccess: invalidate,
  });
}

export function useKarmaCategories(includeHidden = false) {
  return useQuery({
    queryKey: ['karma-categories', includeHidden],
    queryFn: () =>
      request<KarmaCategoryType[]>(
        `/karma-categories${includeHidden ? '?includeHidden=true' : ''}`,
      ),
    staleTime: 60_000,
  });
}

export function useCreateKarmaCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { name: string }) => post('/karma-categories', body),
    onSuccess: invalidate,
  });
}

export function useUpdateKarmaCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; isActive?: boolean }) =>
      patch(`/karma-categories/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteKarmaCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) =>
      request<{ deleted: boolean; hidden?: boolean; usedBy?: number }>(
        `/karma-categories/${id}`,
        { method: 'DELETE' },
      ),
    onSuccess: invalidate,
  });
}

export function useReferenceFull() {
  return useQuery({
    queryKey: ['reference-full'],
    queryFn: () => request<ReferenceFullType>('/reference?includeHidden=true'),
  });
}

export function useCreateDepartment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { name: string; color?: string }) => post('/departments', body),
    onSuccess: invalidate,
  });
}

export function useUpdateDepartment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; color?: string; isActive?: boolean }) =>
      patch(`/departments/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteDepartment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) =>
      request<{ deleted: boolean; usage?: StructureUsageType }>(`/departments/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}

export function useCreateSpecialization() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { name: string; departmentId: number }) =>
      post('/specializations', body),
    onSuccess: invalidate,
  });
}

export function useUpdateSpecialization() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; departmentId?: number; isActive?: boolean }) =>
      patch(`/specializations/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteSpecialization() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) =>
      request<{ deleted: boolean; usage?: StructureUsageType }>(`/specializations/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}

export function useReference() {
  return useQuery({
    queryKey: ['reference'],
    queryFn: () => request<ReferenceType>('/reference'),
    staleTime: 5 * 60_000,
  });
}

/* ------------------------------- мутации ------------------------------- */

/**
 * Почти каждое действие меняет и дашборд, и карточку человека, поэтому
 * инвалидация всегда широкая. На двадцати людях это дешевле, чем ошибиться
 * в точечных ключах и показать устаревший экран.
 */
function useInvalidateAll() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries();
  };
}

export function useQuickMarkDone() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (personId: number) => post(`/people/${personId}/one-on-ones/quick`),
    onSuccess: invalidate,
  });
}

export type SaveOneOnOnePayloadType = {
  personId: number;
  oneOnOneId?: number | null;
  happenedAt: string;
  agenda?: string | null;
  notes?: string | null;
  isSensitive?: boolean;
  climate?: {
    motivation: number;
    workloadPressure: number;
    satisfaction: number;
  } | null;
  commitmentUpdates?: {
    id: number;
    status: 'done' | 'cancelled' | 'snoozed' | 'open';
    snoozedUntil?: string | null;
  }[];
  newCommitments?: {
    direction: 'i_owe' | 'they_owe';
    title: string;
    dueAt?: string | null;
  }[];
  karma?: { category: string; description: string }[];
  nextPlannedAt?: string | null;
};

export function useSaveOneOnOne() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ personId, ...body }: SaveOneOnOnePayloadType) =>
      post(`/people/${personId}/one-on-ones`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCommitment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      status?: string;
      snoozedUntil?: string | null;
      dueAt?: string | null;
    }) => patch(`/commitments/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useCreateCommitment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: {
      personId: number;
      direction: 'i_owe' | 'they_owe';
      title: string;
      dueAt?: string | null;
    }) => post('/commitments', body),
    onSuccess: invalidate,
  });
}

export function useMyCommitments() {
  return useQuery({
    queryKey: ['commitments', 'mine'],
    queryFn: () => request<MyCommitmentType[]>('/commitments/mine'),
  });
}

/* --------------------------------- дела -------------------------------- */

const TODOS_KEY = ['todos'];

export function useTodos() {
  return useQuery({
    queryKey: TODOS_KEY,
    queryFn: () => request<TodoType[]>('/todos'),
  });
}

export function useCreateTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; dueAt?: string | null }) =>
      post<TodoType>('/todos', body),
    onSettled: () => client.invalidateQueries({ queryKey: TODOS_KEY }),
  });
}

/**
 * Галочка и перетаскивание применяются к кэшу сразу, до ответа сервера.
 * Строка, которая после броска на долю секунды прыгает обратно на старое
 * место, читается как «не получилось», и её тащат второй раз.
 */
export function useUpdateTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      title?: string;
      dueAt?: string | null;
      done?: boolean;
    }) => patch<TodoType>(`/todos/${id}`, body),
    onMutate: ({ id, done, ...fields }) => {
      client.setQueryData<TodoType[]>(TODOS_KEY, (list) =>
        list?.map((todo) =>
          todo.id !== id
            ? todo
            : {
                ...todo,
                ...fields,
                ...(done === undefined
                  ? {}
                  : { completedAt: done ? new Date().toISOString() : null }),
              },
        ),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: TODOS_KEY }),
  });
}

export function useReorderTodos() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => post('/todos/reorder', { ids }),
    onMutate: (ids) => {
      client.setQueryData<TodoType[]>(TODOS_KEY, (list) => {
        if (!list) return list;
        const rank = new Map(ids.map((id, index) => [id, index]));
        return [...list]
          .map((todo) => ({ ...todo, position: rank.get(todo.id) ?? todo.position }))
          .sort((a, b) => a.position - b.position);
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: TODOS_KEY }),
  });
}

export function useDeleteTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => del(`/todos/${id}`),
    onMutate: (id) => {
      client.setQueryData<TodoType[]>(TODOS_KEY, (list) => list?.filter((t) => t.id !== id));
    },
    onSettled: () => client.invalidateQueries({ queryKey: TODOS_KEY }),
  });
}

export function useClearCompletedTodos() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => del('/todos/completed'),
    onSettled: () => client.invalidateQueries({ queryKey: TODOS_KEY }),
  });
}

export function useCreateKarma() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: {
      personId: number;
      category: string;
      description: string;
      happenedAt?: string;
    }) => post('/karma', body),
    onSuccess: invalidate,
  });
}

export function useCreatePerson() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => post<PersonType>('/people', body),
    onSuccess: invalidate,
  });
}

export function useUpdatePerson() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      patch<PersonType>(`/people/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useArchivePerson() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      post(`/people/${id}/archive`, { reason: reason ?? null }),
    onSuccess: invalidate,
  });
}

export function useCreateAbsence() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: {
      personId: number;
      fromDay: string;
      toDay: string;
      kind?: string;
    }) => post('/absences', body),
    onSuccess: invalidate,
  });
}

export function useUpdateAbsence() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      fromDay?: string;
      toDay?: string;
      kind?: string;
    }) => patch(`/absences/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAbsence() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => del(`/absences/${id}`),
    onSuccess: invalidate,
  });
}

export function useMuteAlert() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { alertKey: string; days?: number }) =>
      post('/alerts/mute', body),
    onSuccess: invalidate,
  });
}

export function usePlanMeeting() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { personId: number; plannedAt: string }) =>
      post('/one-on-ones/plan', body),
    onSuccess: invalidate,
  });
}

export function useSkipMeeting() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: number) => post(`/one-on-ones/${id}/skip`),
    onSuccess: invalidate,
  });
}


/* ----------------------------- авторизация ----------------------------- */

export type MeType = { id: number; email: string; name: string };

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user } = await request<{ user: MeType }>('/auth/me');
        return user;
      } catch (error) {
        // Отсутствие сессии — это ответ, а не сбой: возвращаем null, иначе
        // экран входа мигал бы сообщением об ошибке.
        if (error instanceof UnauthorizedError) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      request<{ user: MeType }>(LOGIN_PATH, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: ({ user }) => client.setQueryData(['me'], user),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
    // Полная перезагрузка по той же причине, что и при смене команды: в
    // памяти остаются заметки и открытые формы, и сброса кэша тут мало.
    onSuccess: () => window.location.assign('/'),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current: string; next: string }) =>
      request<{ ok: true }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}


/* -------------------------------- косяки -------------------------------- */

export function useIssues(personId: number) {
  return useQuery({
    queryKey: ['issues', personId],
    queryFn: () => request<IssueSummaryType | null>(`/people/${personId}/issues`),
  });
}

export function useAddIssue(personId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { description: string; happenedAt?: string }) =>
      post('/issues', { personId, ...input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['issues', personId] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateIssue(personId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; description?: string; discussedAt?: string | null }) =>
      patch(`/issues/${id}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['issues', personId] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRemoveIssue(personId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => del(`/issues/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['issues', personId] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
