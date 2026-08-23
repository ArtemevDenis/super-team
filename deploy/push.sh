#!/bin/sh
# Выкладка на сервер.
#
# Скриптом, а не руками: набирая rsync по памяти, я один раз забыл исключить
# .env — и --delete снёс с сервера файл с доменом, потому что локально его
# нет и быть не должно. Контейнеры устояли только потому, что compose не
# сумел стартовать и оставил работать прежние.
set -e

SERVER="${SERVER:-root@5.129.209.108}"
REMOTE_DIR="${REMOTE_DIR:-/opt/team-dashboard}"

echo "→ перенос кода на $SERVER"
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'data' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  ./ "$SERVER:$REMOTE_DIR/"

echo "→ проверка окружения"
ssh "$SERVER" "test -f $REMOTE_DIR/.env" || {
  echo "На сервере нет $REMOTE_DIR/.env с APP_DOMAIN — без него Caddy не поднимется."
  exit 1
}

echo "→ сборка и перезапуск"
ssh "$SERVER" "cd $REMOTE_DIR && docker compose up -d --build"

echo "→ состояние"
ssh "$SERVER" 'docker ps --format "{{.Names}}: {{.Status}}"'
