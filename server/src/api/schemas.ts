import { z } from 'zod';

import {
  absenceKinds,
  commitmentDirections,
  commitmentStatuses,
  noteBlockKinds,
  personKinds,
  SCALE_MAX,
} from '../db/schema.js';
import { ALERT_TYPES } from '../domain/alerts.js';
import { specFor } from '../domain/note-blocks.js';

export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата в формате ГГГГ-ММ-ДД');

const scaleSchema = z.number().int().min(1).max(SCALE_MAX);

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const createPersonSchema = z.object({
  fullName: z.string().trim().min(1, 'Имя обязательно'),
  kind: z.enum(personKinds).optional(),
  externalRole: z.string().trim().max(60).nullable().optional(),
  specializationId: z.number().int().positive().nullable().optional(),
  gradeId: z.number().int().positive().nullable().optional(),
  hiredAt: daySchema.nullable().optional(),
  probationEndsAt: daySchema.nullable().optional(),
  birthday: daySchema.nullable().optional(),
  cadenceDays: z.number().int().min(1).max(180).optional(),
});

export const updatePersonSchema = createPersonSchema.partial().extend({
  /** Комментарий к событию: «промо по итогам ревью», «переход в бэкенд». */
  note: z.string().trim().nullable().optional(),
});

export const archivePersonSchema = z.object({
  leftAt: daySchema.nullable().optional(),
  reason: z.string().trim().nullable().optional(),
});

/**
 * Обязательных полей нет намеренно, кроме даты: 1-1 должен сохраняться
 * с одними слайдерами, с одними заметками или вообще пустым. Обязательное
 * поле в двухминутном потоке — это причина бросить заполнение.
 */
export const saveOneOnOneSchema = z.object({
  oneOnOneId: z.number().int().positive().nullable().optional(),
  happenedAt: daySchema,
  agenda: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isSensitive: z.boolean().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  climate: z
    .object({
      motivation: scaleSchema,
      workloadPressure: scaleSchema,
      satisfaction: scaleSchema,
    })
    .nullable()
    .optional(),
  commitmentUpdates: z
    .array(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(commitmentStatuses),
        snoozedUntil: daySchema.nullable().optional(),
      }),
    )
    .optional(),
  newCommitments: z
    .array(
      z.object({
        direction: z.enum(commitmentDirections),
        title: z.string().trim().min(1),
        details: z.string().nullable().optional(),
        dueAt: daySchema.nullable().optional(),
      }),
    )
    .optional(),
  karma: z
    .array(
      z.object({
        category: z.string().trim().min(1),
        // Описание обязательно: категория говорит «что это было», а смысл
        // записи целиком в том, за что именно её поставили. Запись без
        // описания через полгода не восстановить.
        description: z.string().trim().min(1),
      }),
    )
    .optional(),
  nextPlannedAt: daySchema.nullable().optional(),
});

export const createCommitmentSchema = z.object({
  personId: z.number().int().positive(),
  direction: z.enum(commitmentDirections),
  title: z.string().trim().min(1),
  details: z.string().nullable().optional(),
  dueAt: daySchema.nullable().optional(),
});

export const updateCommitmentSchema = z.object({
  status: z.enum(commitmentStatuses).optional(),
  title: z.string().trim().min(1).optional(),
  details: z.string().nullable().optional(),
  dueAt: daySchema.nullable().optional(),
  snoozedUntil: daySchema.nullable().optional(),
});

export const createAbsenceSchema = z
  .object({
    personId: z.number().int().positive(),
    fromDay: daySchema,
    toDay: daySchema,
    kind: z.enum(absenceKinds).optional(),
    note: z.string().nullable().optional(),
  })
  .refine((v) => v.fromDay <= v.toDay, {
    message: 'Дата окончания раньше даты начала',
    path: ['toDay'],
  });

export const updateAbsenceSchema = z
  .object({
    fromDay: daySchema.optional(),
    toDay: daySchema.optional(),
    kind: z.enum(absenceKinds).optional(),
    note: z.string().trim().nullable().optional(),
  })
  .refine((v) => !v.fromDay || !v.toDay || v.fromDay <= v.toDay, {
    message: 'Дата окончания раньше даты начала',
    path: ['toDay'],
  });

export const createKarmaSchema = z.object({
  personId: z.number().int().positive(),
  category: z.string().trim().min(1),
  description: z.string().trim().min(1, 'Опиши, за что именно'),
  happenedAt: daySchema.optional(),
});

export const saveNoteBlockSchema = z
  .object({
    kind: z.enum(noteBlockKinds),
    content: z.string().nullable().optional(),
    value: z.string().nullable().optional(),
    isSensitive: z.boolean().optional(),
    reviewAt: daySchema.nullable().optional(),
  })
  .superRefine((input, ctx) => {
    const spec = specFor(input.kind);
    // Риск ухода — перечисление, а не свободный текст: он поднимает
    // просрочку 1-1 до критичной и включает отдельный алерт, поэтому
    // произвольная строка здесь молча сломала бы движок.
    if (spec?.options && input.value && !spec.options.includes(input.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: `Ожидается одно из: ${spec.options.join(', ')}`,
      });
    }
  });

export const presentationModeSchema = z.object({ enabled: z.boolean() });

/** Картинка приходит уже обрезанной и сжатой клиентом, отсюда и лимит. */
export const photoSchema = z.object({
  dataUrl: z.string().startsWith('data:image/').max(2_000_000),
});

export const saveAssessmentSchema = z.object({
  attributeId: z.number().int().positive(),
  value: scaleSchema,
  confidence: z.enum(['sure', 'assuming']).optional(),
  // Обоснование не обязательно, но именно оно через полгода объясняет,
  // за что стояла четвёрка. Без него оценка превращается в голое число.
  evidence: z.string().trim().nullable().optional(),
  assessedAt: daySchema.optional(),
});

export const bulkAssessmentSchema = z.object({
  items: z.array(saveAssessmentSchema).min(1).max(100),
});

export const createAttributeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  shortCode: z.string().trim().min(2).max(4),
  kind: z.enum(['core', 'skill']),
  specializationId: z.number().int().positive().nullable().optional(),
  axis: z.enum(['skill', 'will', 'neutral']).optional(),
  description: z.string().trim().nullable().optional(),
});

export const updateAttributeSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  shortCode: z.string().trim().min(2).max(4).optional(),
  axis: z.enum(['skill', 'will', 'neutral']).optional(),
  description: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const reorderAttributesSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export const removeGradeExpectationSchema = z.object({
  gradeId: z.number().int().positive(),
  attributeId: z.number().int().positive(),
});

export const gradeExpectationSchema = z.object({
  gradeId: z.number().int().positive(),
  attributeId: z.number().int().positive(),
  expectedValue: scaleSchema,
});

export const karmaCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const updateKarmaCategorySchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  isActive: z.boolean().optional(),
});

export const planMeetingSchema = z.object({
  personId: z.number().int().positive(),
  plannedAt: daySchema,
});

export const muteAlertSchema = z.object({
  alertKey: z.string().min(1),
  days: z.number().int().min(1).max(365).optional(),
  until: daySchema.optional(),
});

export const enabledAlertsSchema = z.object({
  types: z.array(z.enum(ALERT_TYPES)),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().optional(),
  sortOrder: z.number().int().optional(),
});

export const createSpecializationSchema = z.object({
  name: z.string().trim().min(1),
  departmentId: z.number().int().positive(),
  sortOrder: z.number().int().optional(),
});

export const createGradeSchema = z.object({
  name: z.string().trim().min(1),
  level: z.number().int().min(0),
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isActive: z.boolean().optional(),
});

export const updateSpecializationSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  departmentId: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const updateGradeSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  level: z.number().int().min(0).optional(),
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const createIssueSchema = z.object({
  personId: z.number().int().positive(),
  description: z.string().min(1).max(2000),
  happenedAt: z.string().optional(),
  discussedAt: z.string().nullable().optional(),
  oneOnOneId: z.number().int().positive().nullable().optional(),
});

export const updateIssueSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  happenedAt: z.string().optional(),
  // nullable намеренно: отметку о разговоре нужно уметь снять.
  discussedAt: z.string().nullable().optional(),
});
