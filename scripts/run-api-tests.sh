#!/usr/bin/env bash
#
# One-shot API test runner: ensures DB + migrations + server, then runs the
# end-to-end endpoint walk in scripts/test-apis.mjs.
#
# Usage:  npm run test:api        (or)   bash scripts/run-api-tests.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env so we know the port/prefix the server listens on.
set -a; [ -f .env ] && . ./.env; set +a
PORT="${PORT:-4780}"
PREFIX="${API_PREFIX:-api/ivis-backend-service/v1}"
HEALTH="http://localhost:${PORT}/${PREFIX}/"

SERVER_PID=""
STARTED_SERVER=0

cleanup() {
  if [ "$STARTED_SERVER" = "1" ] && [ -n "$SERVER_PID" ]; then
    echo "Stopping server (pid $SERVER_PID)…"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Ensuring Postgres is up"
npm run --silent db:up >/dev/null 2>&1 || true

echo "==> Running migrations"
npm run --silent migration:run

if curl -fs -o /dev/null "$HEALTH" 2>/dev/null; then
  echo "==> Server already running at $HEALTH"
else
  echo "==> Starting server (nest start)…"
  npm run --silent start > /tmp/ivis-api-test-server.log 2>&1 &
  SERVER_PID=$!
  STARTED_SERVER=1

  echo -n "==> Waiting for $HEALTH "
  for i in $(seq 1 60); do
    if curl -fs -o /dev/null "$HEALTH" 2>/dev/null; then echo " up"; break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo " server crashed — last log lines:"; tail -n 30 /tmp/ivis-api-test-server.log; exit 1
    fi
    echo -n "."; sleep 1
    if [ "$i" = "60" ]; then echo " timed out"; tail -n 30 /tmp/ivis-api-test-server.log; exit 1; fi
  done
fi

echo "==> Running API tests"
node scripts/test-apis.mjs "$@"
