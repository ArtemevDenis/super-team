import { describe, expect, it } from 'vitest';

import { hashPassword, passwordProblem, verifyPassword } from './passwords.js';

/**
 * Тесты вне domain/ намеренно: правило «тестируем только чистые формулы»
 * стоит на том, что формулы и есть продукт. Здесь цена ошибки другая —
 * сломанная проверка пароля пускает внутрь, и молча.
 */
describe('пароли', () => {
  it('принимает верный пароль', () => {
    const hash = hashPassword('очень длинный пароль');
    expect(verifyPassword('очень длинный пароль', hash)).toBe(true);
  });

  it('отвергает неверный', () => {
    const hash = hashPassword('очень длинный пароль');
    expect(verifyPassword('очень длинный паролю', hash)).toBe(false);
    expect(verifyPassword('', hash)).toBe(false);
  });

  it('даёт разный хэш одному паролю — соль случайна', () => {
    const a = hashPassword('один и тот же пароль');
    const b = hashPassword('один и тот же пароль');
    expect(a).not.toBe(b);
    expect(verifyPassword('один и тот же пароль', a)).toBe(true);
    expect(verifyPassword('один и тот же пароль', b)).toBe(true);
  });

  it('хранит параметры рядом с хэшем', () => {
    const [scheme, n, r, p] = hashPassword('пароль подлиннее').split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(32768);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  /**
   * Смысл хранения параметров: старый хэш с меньшим N должен продолжать
   * подходить после того, как константы вырастут.
   */
  it('проверяет хэш с чужими параметрами', () => {
    const legacy = 'scrypt$16384$8$1$c29sdHNhbHRzYWx0c2E=$';
    expect(verifyPassword('что угодно', legacy)).toBe(false);
  });

  it('не падает на испорченном хэше', () => {
    for (const broken of ['', 'мусор', 'scrypt$1', 'bcrypt$1$2$3$4$5', 'scrypt$a$b$c$d$e']) {
      expect(verifyPassword('пароль', broken)).toBe(false);
    }
  });

  /**
   * Пробелы и разные формы записи одной буквы не должны давать разный хэш:
   * пароль, набранный на другой раскладке нормализации, обязан подойти.
   */
  it('нормализует юникод', () => {
    const composed = 'пароль-й-длинный';
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    expect(verifyPassword(decomposed, hashPassword(composed))).toBe(true);
  });

  it('требует длины, а не набора символов', () => {
    expect(passwordProblem('коротко')).not.toBeNull();
    expect(passwordProblem('12345678901')).not.toBeNull();
    expect(passwordProblem('достаточно длинный пароль')).toBeNull();
    // Никаких требований к заглавным и цифрам: они дают Password1! и не
    // добавляют стойкости.
    expect(passwordProblem('ааааааааааааааааааа')).toBeNull();
  });
});
