/**
 * Аватар с запасным вариантом из инициалов.
 *
 * Пустой серый кружок на месте лица читается как «данные не загрузились».
 * Инициалы на стабильном цвете выглядят намеренно и не создают ощущения
 * поломки, пока фотографий ещё нет.
 */

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Цвет выводится из имени, чтобы не менялся между перезагрузками. */
function hue(fullName: string): number {
  let hash = 0;
  for (let i = 0; i < fullName.length; i += 1) {
    hash = (hash * 31 + fullName.charCodeAt(i)) % 360;
  }
  return hash;
}

export function Avatar({
  fullName,
  photoPath,
  size = 44,
  className = '',
}: {
  fullName: string;
  photoPath: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };

  if (photoPath) {
    return (
      <img
        src={`/photos/${photoPath}`}
        alt={fullName}
        style={style}
        className={`shrink-0 rounded-lg object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        ...style,
        backgroundColor: `hsl(${hue(fullName)} 22% 26%)`,
        color: `hsl(${hue(fullName)} 40% 72%)`,
        fontSize: size * 0.36,
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-tight ${className}`}
    >
      {initials(fullName)}
    </span>
  );
}
