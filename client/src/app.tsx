import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { DashboardPage } from './pages/dashboard-page';
import { OneOnOnePage } from './pages/one-on-one-page';
import { PeoplePage } from './pages/people-page';
import { PersonPage } from './pages/person-page';
import { PrepPage } from './pages/prep-page';
import { ReassessPage } from './pages/reassess-page';
import { SettingsPage } from './pages/settings-page';
import { LoginPage } from './pages/login-page';
import {
  AUTH_LOST_EVENT,
  useLogout,
  useMe,
  usePresentationMode,
  useSetPresentationMode,
} from './shared/api';
import { TeamSwitcher } from './shared/ui/team-switcher';
import { formatDay, today } from './shared/dates';

const NAV = [
  { to: '/', label: 'Сегодня', end: true },
  { to: '/people', label: 'Команда', end: false },
  { to: '/settings', label: 'Настройки', end: false },
];

/**
 * Ворота: без сессии показывается вход и ничего больше.
 *
 * Проверка стоит выше маршрутов, а не внутри страниц: иначе каждая страница
 * успела бы сходить за своими данными, получить 401 и показать ошибку —
 * то есть истёкшая сессия выглядела бы как поломка приложения.
 */
export function App() {
  const { data: me, isLoading, refetch } = useMe();

  // Сессия может закончиться в любой момент, а не только при загрузке:
  // любой запрос, получивший 401, поднимает это событие.
  useEffect(() => {
    const onLost = () => void refetch();
    window.addEventListener(AUTH_LOST_EVENT, onLost);
    return () => window.removeEventListener(AUTH_LOST_EVENT, onLost);
  }, [refetch]);

  // Пустой экран вместо «загрузка»: проверка занимает миллисекунды, и
  // мелькающая надпись читается как сбой.
  if (isLoading) return <div className="min-h-dvh" />;
  if (!me) return <LoginPage />;

  return <Shell />;
}

function Shell() {
  return (
    <div className="min-h-dvh">
      <PresentationBanner />
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Toast />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route path="/person/:id/prep" element={<PrepPage />} />
          <Route path="/person/:id/one-on-one" element={<OneOnOnePage />} />
          <Route path="/person/:id/reassess" element={<ReassessPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <p className="text-[13px] text-fg-faint">
                Такой страницы нет.{' '}
                <Link to="/" className="underline hover:text-fg-dim">
                  На сегодня
                </Link>
              </p>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-line">
      {/*
        На телефоне шапка переносится в две строки: сверху команда и аккаунт,
        снизу навигация во всю ширину. В один ряд это не помещалось никак —
        переключатель, три пункта, кнопка режима показа, дата и имя дают
        далеко за 390px.
      */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap sm:gap-6 sm:px-6 sm:py-3.5">
        <TeamSwitcher />
        <nav className="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center rounded-md px-2.5 text-[13px] transition-colors sm:min-h-0 sm:py-1.5 ${
                  isActive
                    ? 'bg-surface text-fg'
                    : 'text-fg-faint hover:text-fg-dim'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <PresentationToggle />
        {/* Дату на телефоне не показываем: она и так в строке состояния. */}
        <span className="tnum hidden text-[12px] text-fg-faint sm:inline">
          {formatDay(today())}
        </span>
        <AccountMenu />
      </div>
    </header>
  );
}

function PresentationToggle() {
  const { data } = usePresentationMode();
  const setMode = useSetPresentationMode();
  const enabled = data?.enabled ?? false;

  return (
    <button
      type="button"
      onClick={() => setMode.mutate(!enabled)}
      disabled={setMode.isPending}
      title={
        enabled
          ? 'Чувствительное скрыто на сервере — вернуть'
          : 'Скрыть чувствительное перед тем, как шарить экран'
      }
      className={`ml-auto rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors ${
        enabled
          ? 'border-warning/50 bg-warning/10 text-warning'
          : 'border-line text-fg-faint hover:border-fg-faint hover:text-fg-dim'
      }`}
    >
      {enabled ? 'режим показа включён' : 'шарю экран'}
    </button>
  );
}

/**
 * Плашка на всю ширину, а не значок.
 *
 * У режима два способа навредить: забыть включить перед показом и забыть
 * выключить после. Первое решается видимой кнопкой, второе — тем, что
 * включённый режим невозможно не заметить: иначе через неделю начнёшь
 * искать пропавшие заметки и решишь, что приложение их потеряло.
 */
function PresentationBanner() {
  const { data } = usePresentationMode();
  const setMode = useSetPresentationMode();
  if (!data?.enabled) return null;

  return (
    <div className="border-b border-warning/40 bg-warning/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 text-[12.5px] text-warning">
        <span>
          Режим показа экрана: скрыты риск ухода, демотиваторы, замеры настроя,
          чувствительные заметки и связанные с ними сигналы.
        </span>
        <button
          type="button"
          onClick={() => setMode.mutate(false)}
          className="ml-auto underline decoration-dotted hover:no-underline"
        >
          выключить
        </button>
      </div>
    </div>
  );
}

/**
 * Тост после сохранения 1-1: цикл должен видимо замыкаться, иначе непонятно,
 * что встреча записалась и следующая назначена.
 */
function Toast() {
  const location = useLocation();
  const message = (location.state as { toast?: string } | null)?.toast;
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
    if (!message) return;
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!visible || !message) return null;

  return (
    <div className="mb-6 rounded-lg border border-positive/40 bg-positive/10 px-4 py-2.5 text-[13.5px] text-positive">
      {message}
    </div>
  );
}


/**
 * Кто вошёл и как выйти.
 *
 * Имя показано постоянно: на общем адресе с двумя аккаунтами вопрос «чьи
 * это данные» должен решаться взглядом, а не проверкой.
 */
function AccountMenu() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  if (!me) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12px] text-fg-faint transition-colors hover:text-fg-dim"
      >
        {me.name}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-line bg-raised p-1.5 shadow-xl">
            <p className="truncate px-2.5 py-1 text-[12px] text-fg-faint">{me.email}</p>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg-dim transition-colors hover:bg-surface"
            >
              выйти
            </button>
          </div>
        </>
      )}
    </div>
  );
}
