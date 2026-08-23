import crypto from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { loginAttempts, sessions, users } from '../db/schema.js';
import { verifyPassword } from './passwords.js';

export type UserType = typeof users.$inferSelect;

/** Месяц: инструмент открывают не каждый день, а вход на два человека. */
const SESSION_DAYS = 30;
/** Продлеваем не чаще раза в сутки — иначе запись в базу на каждый запрос. */
const RENEW_AFTER_HOURS = 24;

const SESSION_COOKIE = 'td_session';
export { SESSION_COOKIE };

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const iso = (date: Date): string => date.toISOString();
const plusDays = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000);

/* --------------------------- троттлинг --------------------------- */

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 8;

function recentAttempts(email: string, ip: string): number {
  const since = iso(new Date(Date.now() - WINDOW_MINUTES * 60 * 1000));
  return db
    .select({ email: loginAttempts.email, ip: loginAttempts.ip })
    .from(loginAttempts)
    .where(gt(loginAttempts.attemptedAt, since))
    .all()
    // По почте ИЛИ по адресу: перебор с одного адреса по разным почтам
    // иначе проходит мимо счётчика, привязанного только к почте.
    .filter((row) => row.email === email || row.ip === ip).length;
}

function recordAttempt(email: string, ip: string): void {
  db.insert(loginAttempts).values({ email, ip, attemptedAt: iso(new Date()) }).run();
}

/**
 * Успешный вход снимает счётчик только по своей почте.
 *
 * По адресу — нельзя, и это не мелочь: чистка по IP снимала блокировку со
 * всех попыток с него, включая чужие почты. С публичным демо это делало
 * троттлинг декорацией — восемь попыток подбора, вход в демо, счётчик
 * обнулён, и так до бесконечности.
 *
 * Успешный вход доказывает владение конкретной почтой, а не безобидность
 * адреса, поэтому и снимает он ровно её.
 */
export function clearAttempts(email: string): void {
  db.delete(loginAttempts).where(eq(loginAttempts.email, email)).run();
}

/* ----------------------------- вход ------------------------------ */

export type LoginResultType =
  | { ok: true; user: UserType; token: string }
  | { ok: false; reason: 'throttled' | 'invalid' };

/**
 * Вход.
 *
 * Несуществующая почта и неверный пароль дают одинаковый ответ и проходят
 * одинаковый путь: разная формулировка или заметная разница во времени
 * ответа превращают форму входа в список действующих аккаунтов.
 */
export function login(email: string, password: string, ip: string): LoginResultType {
  const normalized = email.trim().toLowerCase();
  const user = db.select().from(users).where(eq(users.email, normalized)).get();

  // Демо-аккаунт не троттлится: его пароль опубликован, защищать от подбора
  // нечего — а вот запереть демо восемью неверными попытками смог бы кто
  // угодно, и ограничение работало бы против своих же посетителей.
  if (!user?.isDemo && recentAttempts(normalized, ip) >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'throttled' };
  }

  // Проверяем пароль даже без пользователя — против фиктивного хэша.
  // Иначе быстрый отказ по несуществующей почте отличается по времени от
  // медленной проверки scrypt, и почты можно перебрать секундомером.
  const stored = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = verifyPassword(password, stored);

  if (!user || !passwordOk) {
    if (!user?.isDemo) recordAttempt(normalized, ip);
    return { ok: false, reason: 'invalid' };
  }

  clearAttempts(normalized);
  return { ok: true, user, token: createSession(user.id) };
}

/**
 * Хэш заведомо недостижимого пароля: нужен только чтобы время ответа на
 * несуществующую почту совпадало со временем ответа на существующую.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/* --------------------------- сессии ------------------------------ */

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = iso(new Date());
  db.insert(sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      expiresAt: iso(plusDays(SESSION_DAYS)),
      lastSeenAt: now,
    })
    .run();
  return token;
}

/** Возвращает пользователя действующей сессии и продлевает её при нужде. */
export function resolveSession(token: string | undefined): UserType | null {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, iso(new Date()))))
    .get();
  if (!session) return null;

  const staleAfter = iso(new Date(Date.now() - RENEW_AFTER_HOURS * 60 * 60 * 1000));
  if (session.lastSeenAt < staleAfter) {
    db.update(sessions)
      .set({ lastSeenAt: iso(new Date()), expiresAt: iso(plusDays(SESSION_DAYS)) })
      .where(eq(sessions.tokenHash, tokenHash))
      .run();
  }

  return db.select().from(users).where(eq(users.id, session.userId)).get() ?? null;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
}

/** Все сессии пользователя — после смены пароля старые входы должны отпасть. */
export function destroyAllSessions(userId: number): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Чистка просроченного: вызывается при старте, таблицы не должны расти вечно. */
export function purgeExpired(): void {
  const now = iso(new Date());
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
  db.delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, iso(new Date(Date.now() - 24 * 60 * 60 * 1000))))
    .run();
}
