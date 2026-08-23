import fs from 'node:fs';
import path from 'node:path';

import cookieParser from 'cookie-parser';
import express from 'express';

import { clientDistDir, dbPath, photosDir } from './db/paths.js';
import { api, errorHandler } from './api/router.js';
import { authRoutes, requireAuth } from './api/auth-routes.js';
import { purgeExpired } from './auth/sessions.js';

// Не 3000/3001/5173: на этой машине они заняты другими проектами, и коллизия
// проявляется коварно — localhost резолвится в ::1 и запрос уходит к чужому
// dev-серверу, а свой при этом спокойно слушает IPv4 и выглядит рабочим.
const PORT = Number(process.env.PORT ?? 4571);

const app = express();

// Приложение стоит за обратным прокси с HTTPS: без этого req.ip показывал бы
// адрес прокси, и троттлинг входа считал бы все попытки как одну.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Минимум заголовков вместо helmet: список короткий и понятный, а зависимость
// с полусотней настроек по умолчанию труднее проверить, чем четыре строки.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// CORS нет намеренно: в разработке фронт ходит через прокси Vite, в проде
// статику раздаёт этот же процесс. Отсутствие CORS-заголовков вместе с
// SameSite=Lax на куке и есть защита от CSRF — чужой сайт не сможет ни
// приложить куку, ни прочитать ответ.

/**
 * Фотографии за авторизацией.
 *
 * Раньше их раздавала express.static без всяких проверок: имя файла
 * генерируется сервером и угадать его трудно — но на публичном хосте
 * «трудно угадать» не защита, а отсрочка. Это фотографии сотрудников,
 * и они закрыты так же, как заметки о них.
 */
app.use('/photos', requireAuth, express.static(photosDir, { maxAge: '1y', immutable: true }));

app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Нет такого метода' }));
app.use(errorHandler);

// В проде один процесс отдаёт и API, и собранный фронт — именно это делает
// проект приложением, а не связкой из двух dev-серверов.
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

purgeExpired();

app.listen(PORT, () => {
  console.log(`API на http://localhost:${PORT}`);
  console.log(`База: ${dbPath}`);
});
