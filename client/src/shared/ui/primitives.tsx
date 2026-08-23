import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

import type { AlertSeverityType } from '../types';

export const SEVERITY_TEXT: Record<AlertSeverityType, string> = {
  critical: 'text-critical',
  warning: 'text-warning',
  info: 'text-info',
  positive: 'text-positive',
};

export const SEVERITY_BORDER: Record<AlertSeverityType, string> = {
  critical: 'border-l-critical',
  warning: 'border-l-warning',
  info: 'border-l-info',
  positive: 'border-l-positive',
};

export const SEVERITY_DOT: Record<AlertSeverityType, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  info: 'bg-info',
  positive: 'bg-positive',
};

type ButtonPropsType = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'ghost' | 'quiet';
};

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonPropsType) {
  // min-h-11 — 44px, минимальная зона касания. На больших экранах
  // возвращаем прежнюю плотность: там курсор, и раздутые кнопки только
  // растащили бы интерфейс.
  const base =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed sm:min-h-0 sm:px-2.5';
  const styles = {
    solid: 'bg-fg text-ink hover:bg-white',
    ghost: 'border border-line text-fg-dim hover:border-fg-faint hover:text-fg',
    quiet: 'text-fg-faint hover:text-fg-dim',
  }[variant];

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

/**
 * Панель, свёрнутая по умолчанию.
 *
 * Для того, что нужно изредка и занимает много места: оценки по всем
 * компетенциям и вся история человека. Развёрнутые всегда, они отодвигали
 * вниз то, к чему возвращаешься каждый день, — а страница человека нужна
 * прежде всего перед встречей, а не для изучения архива.
 *
 * Свёрнутое состояние показывает счётчик: спойлер без числа не даёт понять,
 * стоит ли вообще открывать.
 */
export function CollapsiblePanel({
  title,
  count,
  summary,
  defaultOpen = false,
  children,
  className = '',
}: {
  title: string;
  count?: number;
  /** Короткая строка под заголовком, видна и в свёрнутом виде. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-baseline gap-2 text-left"
      >
        <h2 className="eyebrow">
          {title}
          {count !== undefined && count > 0 && (
            <span className="tnum ml-2 text-fg-faint normal-case tracking-normal">
              {count}
            </span>
          )}
        </h2>
        {summary && !open && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-fg-faint">
            {summary}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[12px] text-fg-faint">
          {open ? 'свернуть ▴' : 'развернуть ▾'}
        </span>
      </button>

      {open && children}
    </section>
  );
}

export function Panel({
  title,
  count,
  action,
  children,
  className = '',
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">
          {title}
          {count !== undefined && count > 0 && (
            <span className="tnum ml-2 text-fg-faint normal-case tracking-normal">
              {count}
            </span>
          )}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-faint">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-faint">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-info focus:outline-none';

export const TextInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function TextInput(props, ref) {
  return (
    <input ref={ref} {...props} className={`${inputClass} ${props.className ?? ''}`} />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea(props, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`${inputClass} resize-y leading-relaxed ${props.className ?? ''}`}
    />
  );
});

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}
