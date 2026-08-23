import crypto from 'node:crypto';

/**
 * Хэширование паролей на scrypt из node:crypto.
 *
 * Без argon2 намеренно: он потребовал бы нативной сборки рядом с уже
 * имеющейся better-sqlite3, а scrypt входит в стандартную библиотеку и
 * допущен OWASP. Одной зависимостью меньше — одной поломкой при обновлении
 * Node меньше.
 *
 * N = 2^15 даёт 128 · N · r = 33 МБ памяти на одну проверку. Это дорого
 * для перебора и безопасно для дешёвой машины: попыток входа мало, а при
 * всплеске их ограничивает троттлинг, а не объём памяти.
 */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
// Запас над 128 · N · r: без него scrypt падает с ошибкой лимита памяти.
const MAX_MEM = 64 * 1024 * 1024;

const derive = (password: string, salt: Buffer): Buffer =>
  crypto.scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });

/** Формат: scrypt$N$r$p$соль$ключ — параметры хранятся рядом с хэшем. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = derive(password, salt);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Проверка пароля.
 *
 * Параметры читаются из самого хэша, а не берутся из констант выше: иначе
 * в день, когда N вырастет, все существующие пароли перестанут подходить.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, rawN, rawR, rawP, rawSalt, rawKey] = stored.split('$');
  if (scheme !== 'scrypt' || !rawN || !rawR || !rawP || !rawSalt || !rawKey) return false;

  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(rawSalt, 'base64');
    expected = Buffer.from(rawKey, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
  } catch {
    return false;
  }

  // Сравнение постоянного времени: обычное === выдаёт длину общего префикса
  // разницей во времени ответа.
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Требования к паролю — только длина.
 *
 * Правила про заглавные и цифры дают предсказуемые пароли вида Password1!
 * и не добавляют стойкости; длина добавляет.
 */
export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Пароль короче ${MIN_PASSWORD_LENGTH} символов`;
  }
  return null;
}
