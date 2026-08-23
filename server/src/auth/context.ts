import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextType = {
  userId: number;
  /** Активная команда пользователя на момент запроса. */
  teamId: number;
};

/**
 * Контекст запроса вместо глобального состояния сервера.
 *
 * Раньше «текущая команда» лежала строкой в настройках — то есть была
 * свойством процесса. С двумя пользователями это означало, что один
 * переключает команду, а у второго меняется экран посреди встречи.
 *
 * AsyncLocalStorage выбран вместо протаскивания контекста через сигнатуры:
 * currentTeamId() вызывается в 27 местах девяти файлов, и каждое из них
 * пришлось бы менять вместе со всей цепочкой вызовов до роутов. Здесь же
 * меняется только источник значения — а значит, ни одно место фильтрации
 * по команде нельзя случайно потерять при правке.
 */
const storage = new AsyncLocalStorage<RequestContextType>();

export function runWithContext<T>(context: RequestContextType, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContextType | undefined {
  return storage.getStore();
}

/**
 * Контекст обязателен.
 *
 * Бросаем, а не подставляем значение по умолчанию: молчаливый откат на
 * «первого пользователя» означал бы, что забытая проверка авторизации
 * выглядит как работающий код и показывает чужие данные.
 */
export function requireContext(): RequestContextType {
  const context = storage.getStore();
  if (!context) {
    throw new Error('Нет контекста запроса: обращение к данным без авторизации');
  }
  return context;
}
