import { useState, type FormEvent } from 'react';

import { useLogin } from '../shared/api';
import { Button, TextInput } from '../shared/ui/primitives';

/**
 * Вход.
 *
 * Одна колонка по центру, ничего кроме формы: на этом экране нечего
 * изучать. Регистрации нет и ссылки на неё нет — аккаунт заводится на
 * сервере командой, и предлагать здесь несуществующий путь было бы враньём.
 */
export function LoginPage() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    login.mutate({ email: email.trim(), password });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-72">
        <h1 className="text-[15px] font-medium">Команда</h1>
        <p className="mt-1 mb-6 text-[13px] text-fg-faint">
          Заметки о людях, встречи и договорённости.
        </p>

        <label className="mb-3 block">
          <span className="eyebrow mb-1.5 block">Почта</span>
          <TextInput
            autoFocus
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="mb-4 block">
          <span className="eyebrow mb-1.5 block">Пароль</span>
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {login.isError && (
          <p className="mb-3 text-[12.5px] text-critical">{login.error.message}</p>
        )}

        <Button
          type="submit"
          variant="solid"
          disabled={login.isPending}
          className="w-full justify-center"
        >
          {login.isPending ? 'входим…' : 'войти'}
        </Button>
      </form>
    </div>
  );
}
