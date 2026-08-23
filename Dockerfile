# Сборка и запуск в контейнере, а не на хосте.
#
# На сервере уже работает Outline в докере. Ставить туда Node, компиляторы
# для better-sqlite3 и системный веб-сервер значило бы обновлять пакеты, от
# которых зависит работающий VPN. В контейнере хост не меняется вовсе.

FROM node:22-bookworm-slim AS build

# better-sqlite3 — нативный модуль и собирается из исходников.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Манифесты отдельным слоем: пока зависимости не менялись, npm ci не
# переустанавливается при каждой правке кода.
COPY package*.json ./
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci && npm --prefix server ci && npm --prefix client ci

COPY . .
RUN npm run build \
  # prune вместо повторной установки в финальном образе: так уже собранный
  # бинарник better-sqlite3 переезжает как есть, и компиляторы не нужны
  # второй раз. Базовый образ тот же, значит ABI совпадает.
  && npm --prefix server prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app/server
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
# Миграции читаются с диска во время запуска, в сборку они не попадают.
COPY --from=build /app/server/drizzle ./drizzle
# Путь важен: clientDistDir вычисляется как ../../../client/dist от dist/db.
COPY --from=build /app/client/dist /app/client/dist
COPY --chmod=755 deploy/entrypoint.sh /app/entrypoint.sh

# Своим пользователем, а не root: том с данными монтируется снаружи, и
# файлы базы не должны оказаться root-owned на хосте.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 4571
ENTRYPOINT ["/app/entrypoint.sh"]
