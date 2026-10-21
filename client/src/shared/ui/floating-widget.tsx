import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import {
  useMyCommitments,
  usePresentationMode,
  useSetPresentationMode,
  useTodos,
} from '../api';
import { MyCommitments } from './my-commitments';
import { countBurning, TodoList, TodoQuickAdd } from './todo-list';

/**
 * Плавающий виджет поверх всех окон — как мини-окно созвона.
 *
 * Document Picture-in-Picture, а не отдельная страница в маленьком окне:
 * обычное окно уходит под редактор при первом клике, а PiP держится сверху.
 * Есть только в Chromium и живёт, пока открыта вкладка приложения.
 *
 * Содержимое рендерится порталом из этого же React-дерева. Поэтому у виджета
 * общий с вкладкой кэш запросов (галочка в окошке сразу видна на странице),
 * а навигация из него уходит в основную вкладку.
 */

type DocumentPipType = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
};

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPipType;
  }
}

type WidgetContextType = {
  supported: boolean;
  isOpen: boolean;
  toggle: () => void;
};

const WidgetContext = createContext<WidgetContextType>({
  supported: false,
  isOpen: false,
  toggle: () => undefined,
});

export const useFloatingWidget = () => useContext(WidgetContext);

export function FloatingWidgetProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  const [pip, setPip] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);

  // После выхода окошко с делами не должно остаться висеть поверх формы входа.
  useEffect(() => {
    if (!signedIn) pipRef.current?.close();
  }, [signedIn]);
  useEffect(() => () => pipRef.current?.close(), []);

  const toggle = useCallback(async () => {
    if (pipRef.current) {
      pipRef.current.close();
      return;
    }
    const api = window.documentPictureInPicture;
    if (!api) return;

    const win = await api.requestWindow({ width: 340, height: 460 });
    copyStyles(win.document);
    win.document.title = 'Дела';

    win.addEventListener('pagehide', () => {
      pipRef.current = null;
      setPip(null);
    });
    pipRef.current = win;
    setPip(win);
  }, []);

  return (
    <WidgetContext.Provider value={{ supported, isOpen: pip !== null, toggle }}>
      {children}
      {pip && createPortal(<WidgetBody win={pip} />, pip.document.body)}
    </WidgetContext.Provider>
  );
}

/**
 * Стили переносятся копией правил, а не ссылкой: в dev Vite держит CSS в
 * <style> без адреса, и <link> на него поставить нельзя. Таблицы с другого
 * домена правила не отдают — для них остаётся ссылка.
 */
function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      target.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}

/* ------------------------------- содержимое ----------------------------- */

const TABS = [
  { key: 'todos', label: 'Дела' },
  { key: 'commitments', label: 'Обещания' },
] as const;

type TabKeyType = (typeof TABS)[number]['key'];

/** Ниже этой высоты окошко — полоска: только счётчики и строка ввода. */
const COMPACT_HEIGHT = 190;

function useWindowHeight(win: Window): number {
  const [height, setHeight] = useState(win.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(win.innerHeight);
    win.addEventListener('resize', onResize);
    return () => win.removeEventListener('resize', onResize);
  }, [win]);
  return height;
}

function WidgetBody({ win }: { win: Window }) {
  const [tab, setTab] = useState<TabKeyType>('todos');
  const compact = useWindowHeight(win) < COMPACT_HEIGHT;
  const { data: todos = [] } = useTodos();
  const { data: commitments = [] } = useMyCommitments();

  const counts: Record<TabKeyType, { total: number; burning: number }> = {
    todos: {
      total: todos.filter((t) => t.completedAt === null).length,
      burning: countBurning(todos),
    },
    commitments: {
      total: commitments.length,
      burning: countBurning(commitments),
    },
  };

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      <header className="flex shrink-0 items-center gap-0.5 border-b border-line px-1.5 py-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-[12.5px] transition-colors ${
              tab === item.key && !compact ? 'bg-surface text-fg' : 'text-fg-faint hover:text-fg-dim'
            }`}
          >
            {item.label}
            <TabCount {...counts[item.key]} />
          </button>
        ))}
        <PresentationSwitch />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-2">
        {compact ? (
          <TodoQuickAdd autoFocus />
        ) : tab === 'todos' ? (
          <TodoList autoFocus />
        ) : (
          <MyCommitments />
        )}
      </main>
    </div>
  );
}

function TabCount({ total, burning }: { total: number; burning: number }) {
  if (total === 0) return null;
  return (
    <span className="tnum text-[11px]">
      {burning > 0 && <span className="text-critical">{burning}/</span>}
      <span className="text-fg-faint">{total}</span>
    </span>
  );
}

/**
 * Режим показа включается прямо отсюда. Окошко висит поверх всего и
 * попадает в любую демонстрацию экрана, а в момент шаринга тянуться за
 * кнопкой в основную вкладку некогда.
 */
function PresentationSwitch() {
  const { data } = usePresentationMode();
  const setMode = useSetPresentationMode();
  const enabled = data?.enabled ?? false;

  return (
    <button
      type="button"
      onClick={() => setMode.mutate(!enabled)}
      disabled={setMode.isPending}
      title={enabled ? 'Режим показа включён — вернуть' : 'Скрыть дела перед показом экрана'}
      className={`ml-auto rounded px-1.5 py-1 text-[11.5px] transition-colors ${
        enabled ? 'bg-warning/10 text-warning' : 'text-fg-faint hover:text-fg-dim'
      }`}
    >
      {enabled ? 'показ' : 'шарю'}
    </button>
  );
}

export function FloatingWidgetButton() {
  const { supported, isOpen, toggle } = useFloatingWidget();
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      title="Мини-окно с делами поверх всех окон"
      className={`rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors ${
        isOpen
          ? 'border-info/50 bg-info/10 text-fg-dim'
          : 'border-line text-fg-faint hover:border-fg-faint hover:text-fg-dim'
      }`}
    >
      {isOpen ? 'закрыть виджет' : 'виджет'}
    </button>
  );
}
