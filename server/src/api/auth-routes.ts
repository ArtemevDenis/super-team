import { Router, type NextFunction, type Request, type Response } from 'express';

import { runWithContext } from '../auth/context.js';
import {
  createSession,
  destroyAllSessions,
  destroySession,
  login,
  resolveSession,
  SESSION_COOKIE,
  type UserType,
} from '../auth/sessions.js';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/passwords.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { nowTs } from '../domain/dates.js';
import { resolveActiveTeam } from '../repositories/teams.js';
import { eq } from 'drizzle-orm';

const isProduction = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;

/**
 * Кука сессии.
 *
 * httpOnly — чтобы её не достал скрипт на странице. SameSite=Lax закрывает
 * CSRF: браузер не приложит куку к запросу с чужого сайта, а API принимает
 * только JSON и не отдаёт CORS-заголовков, так что отдельный CSRF-токен
 * здесь добавил бы кода без защиты. Secure только в проде — иначе кука не
 * поставится на http://localhost при разработке.
 */
function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}

const publicUser = (user: UserType) => ({
  id: user.id,
  email: user.email,
  name: user.name,
});

/* --------------------------- маршруты ---------------------------- */

export const authRoutes = Router();

authRoutes.post('/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const ip = req.ip ?? 'неизвестно';

  const result = login(email, password, ip);

  if (!result.ok) {
    if (result.reason === 'throttled') {
      return res.status(429).json({
        error: 'Слишком много попыток входа. Подожди 15 минут.',
      });
    }
    // Одна формулировка на «нет такой почты» и «неверный пароль»: разные
    // ответы превращают форму входа в список действующих аккаунтов.
    return res.status(401).json({ error: 'Неверная почта или пароль' });
  }

  setSessionCookie(res, result.token);
  res.json({ user: publicUser(result.user) });
});

authRoutes.post('/logout', (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Кто я. Единственный способ клиента узнать, жива ли сессия. */
authRoutes.get('/me', (req, res) => {
  const user = resolveSession(req.cookies?.[SESSION_COOKIE]);
  if (!user) return res.status(401).json({ error: 'Нужен вход' });
  res.json({ user: publicUser(user) });
});

authRoutes.post('/password', (req, res) => {
  const user = resolveSession(req.cookies?.[SESSION_COOKIE]);
  if (!user) return res.status(401).json({ error: 'Нужен вход' });

  if (user.isDemo) {
    // Пароль демо опубликован. Разреши смену — и первый зашедший запрёт
    // демо от всех остальных одной кнопкой.
    return res.status(403).json({ error: 'У демо-аккаунта пароль не меняется' });
  }

  const current = typeof req.body?.current === 'string' ? req.body.current : '';
  const next = typeof req.body?.next === 'string' ? req.body.next : '';

  if (!verifyPassword(current, user.passwordHash)) {
    return res.status(400).json({ error: 'Текущий пароль неверен' });
  }

  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ error: problem });

  db.update(users)
    .set({ passwordHash: hashPassword(next), updatedAt: nowTs() })
    .where(eq(users.id, user.id))
    .run();

  // Все прочие входы отпадают: смена пароля должна выбрасывать того, кто
  // мог его знать. Свою сессию выдаём заново, чтобы не разлогинить себя.
  destroyAllSessions(user.id);
  setSessionCookie(res, createSession(user.id));
  res.json({ ok: true });
});

/* -------------------------- middleware --------------------------- */

/**
 * Проверка сессии перед любым обращением к данным.
 *
 * Здесь же открывается контекст запроса: всё, что вызовется дальше по
 * стеку, увидит своего пользователя и свою команду. Вне этого middleware
 * currentTeamId() бросает — то есть роут, забывший авторизацию, падает
 * с ошибкой, а не показывает чужие данные.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = resolveSession(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: 'Нужен вход' });
    return;
  }

  const teamId = resolveActiveTeam(user.id, user.activeTeamId);
  if (teamId === null) {
    res.status(409).json({ error: 'Нет ни одной команды' });
    return;
  }

  runWithContext({ userId: user.id, teamId }, () => next());
}
