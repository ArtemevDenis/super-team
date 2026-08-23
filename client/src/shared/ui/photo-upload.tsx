import { useRef, useState } from 'react';

import { useDeletePhoto, useUploadPhoto } from '../api';
import { Avatar } from './avatar';
import { Button } from './primitives';

const SIZE = 320;
const QUALITY = 0.85;

/**
 * Обрезка в квадрат и сжатие происходят здесь, до отправки.
 *
 * Иначе на сервере понадобилась бы библиотека обработки изображений, а в
 * папке с данными копились бы двадцатимегабайтные снимки с телефона —
 * ради картинки, которая на экране занимает сорок пикселей.
 */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  // Лицо обычно в верхней части кадра, поэтому по вертикали берём выше
  // центра — иначе портрет обрезается по подбородку.
  const sy = Math.max(0, (bitmap.height - side) / 2 - side * 0.08);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не дал холст для обрезки');

  context.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', QUALITY);
}

export function PhotoUpload({
  personId,
  fullName,
  photoPath,
  size = 64,
}: {
  personId: number;
  fullName: string;
  photoPath: string | null;
  size?: number;
}) {
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    try {
      const dataUrl = await toSquareDataUrl(file);
      upload.mutate(
        { personId, dataUrl },
        { onError: (e) => setError(e instanceof Error ? e.message : 'Не вышло') },
      );
    } catch {
      setError('Не удалось прочитать файл — нужен JPEG, PNG или WebP');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={photoPath ? 'Заменить фото' : 'Добавить фото'}
        className="rounded-lg ring-offset-2 ring-offset-ink transition-opacity hover:opacity-80"
      >
        <Avatar fullName={fullName} photoPath={photoPath} size={size} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="flex flex-col gap-1">
        <Button variant="quiet" onClick={() => inputRef.current?.click()}>
          {upload.isPending
            ? 'загружаю…'
            : photoPath
              ? 'заменить фото'
              : 'добавить фото'}
        </Button>
        {photoPath && (
          <Button variant="quiet" onClick={() => remove.mutate(personId)}>
            убрать
          </Button>
        )}
        {error && <span className="text-[11px] text-critical">{error}</span>}
      </div>
    </div>
  );
}
