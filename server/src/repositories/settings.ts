import { and, eq, gt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { alertMutes, settings } from '../db/schema.js';
import {
  ALERT_TYPES,
  DEFAULT_ENABLED_ALERTS,
  type AlertTypeKeyType,
} from '../domain/alerts.js';
import { addDays, nowTs, today, type DayType } from '../domain/dates.js';
import { currentTeamId } from './teams.js';

/**
 * Область 0 — общие настройки приложения (режим показа экрана), иначе
 * идентификатор команды. При полной изоляции набор включённых сигналов
 * у каждой команды свой.
 */
export function getSetting(key: string, teamId = 0): string | null {
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.key, key), eq(settings.teamId, teamId)))
    .get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string, teamId = 0): void {
  db.insert(settings)
    .values({ teamId, key, value })
    .onConflictDoUpdate({
      target: [settings.teamId, settings.key],
      set: { value, updatedAt: nowTs() },
    })
    .run();
}

const ENABLED_ALERTS_KEY = 'enabled_alerts';

export function getEnabledAlerts(): AlertTypeKeyType[] {
  const raw = getSetting(ENABLED_ALERTS_KEY, currentTeamId());
  if (!raw) return [...DEFAULT_ENABLED_ALERTS];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [...DEFAULT_ENABLED_ALERTS];

  const valid = new Set<string>(ALERT_TYPES);
  return parsed.filter((t): t is AlertTypeKeyType => typeof t === 'string' && valid.has(t));
}

export function setEnabledAlerts(types: readonly AlertTypeKeyType[]): void {
  setSetting(ENABLED_ALERTS_KEY, JSON.stringify(types), currentTeamId());
}

/* ---------------------------- заглушки ---------------------------- */

/**
 * Заглушка всегда срочная: только «до дня X», без «скрыть навсегда».
 * Постоянное скрытие смешало бы ручное состояние с пересчётом, и появились
 * бы алерты-зомби, которые невозможно объяснить.
 */
export function muteAlert(alertKey: string, days = 7): void {
  db.insert(alertMutes)
    .values({
      alertKey,
      mutedUntil: addDays(today(), days),
      mutedAt: nowTs(),
    })
    .onConflictDoUpdate({
      target: alertMutes.alertKey,
      set: { mutedUntil: addDays(today(), days), mutedAt: nowTs() },
    })
    .run();
}

export function muteAlertUntil(alertKey: string, until: DayType): void {
  db.insert(alertMutes)
    .values({ alertKey, mutedUntil: until, mutedAt: nowTs() })
    .onConflictDoUpdate({
      target: alertMutes.alertKey,
      set: { mutedUntil: until, mutedAt: nowTs() },
    })
    .run();
}

export function unmuteAlert(alertKey: string): void {
  db.delete(alertMutes).where(eq(alertMutes.alertKey, alertKey)).run();
}

export function listActiveMutes(day: DayType = today()): Record<string, DayType> {
  const rows = db
    .select()
    .from(alertMutes)
    .where(gt(alertMutes.mutedUntil, day))
    .all();

  return Object.fromEntries(rows.map((row) => [row.alertKey, row.mutedUntil]));
}

export function listAllMutes(): (typeof alertMutes.$inferSelect)[] {
  return db.select().from(alertMutes).all();
}
