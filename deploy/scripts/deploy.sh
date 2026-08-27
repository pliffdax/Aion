#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_DIR="${AION_SHARED_DIR:-/srv/aion/shared}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
DEPLOY_LOCK_FILE="${AION_DEPLOY_LOCK_FILE:-/tmp/aion-deploy.lock}"
DEPLOY_LOCK_TIMEOUT="${AION_DEPLOY_LOCK_TIMEOUT:-1800}"

cd "$ROOT_DIR"

for env_file in api.env telegram-bot.env; do
  if [[ ! -f "$SHARED_DIR/$env_file" ]]; then
    echo "Missing $SHARED_DIR/$env_file" >&2
    exit 1
  fi
done

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USERNAME:-pliffdax}" --password-stdin
fi

set -a
source "$SHARED_DIR/api.env"
set +a

if [[ -z "${AION_POSTGRES_PASSWORD:-}" ]]; then
  echo "AION_POSTGRES_PASSWORD is required in $SHARED_DIR/api.env" >&2
  exit 1
fi

export AION_IMAGE_TAG="${AION_IMAGE_TAG:-latest}"
export AION_SHARED_DIR="$SHARED_DIR"
export AION_COMPOSE_PROJECT="${AION_COMPOSE_PROJECT:-aion}"
export AION_API_HOST_PORT="${AION_API_HOST_PORT:-3010}"
export AION_POSTGRES_HOST_PORT="${AION_POSTGRES_HOST_PORT:-5442}"
export AION_PG_VOLUME="${AION_PG_VOLUME:-aion_pg}"
export AION_POSTGRES_PASSWORD

exec 9>"$DEPLOY_LOCK_FILE"
if ! flock -w "$DEPLOY_LOCK_TIMEOUT" 9; then
  echo "Timed out waiting for deploy lock $DEPLOY_LOCK_FILE" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" pull api telegram-bot
docker compose -f "$COMPOSE_FILE" up -d postgres --wait
docker compose -f "$COMPOSE_FILE" run --rm --no-deps api \
  node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema
docker compose -f "$COMPOSE_FILE" up -d --wait api telegram-bot

health_response="$(
  curl \
    --fail \
    --silent \
    --show-error \
    --retry 10 \
    --retry-delay 2 \
    --retry-connrefused \
    "http://127.0.0.1:${AION_API_HOST_PORT}/api/health"
)"

if [[ "$health_response" != *'"ok":true'* || "$health_response" != *'"database":"ok"'* ]]; then
  echo "Unexpected API health response: $health_response" >&2
  exit 1
fi

sleep "${AION_SMOKE_STABILIZATION_SECONDS:-10}"

for service in api telegram-bot; do
  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$service")"
  if [[ -z "$container_id" ]]; then
    echo "No container found for $service" >&2
    exit 1
  fi

  state="$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.RestartCount}}' "$container_id")"
  if [[ "$state" != 'running|healthy|0' ]]; then
    echo "$service failed smoke verification: $state" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail 100 "$service" >&2
    exit 1
  fi
done

docker compose -f "$COMPOSE_FILE" ps

# The project-wide lock above keeps the production and development deploys from
# pruning an image while the other environment is between pull and compose up.
docker image prune -af \
  --filter 'label=io.aion.runtime=true' \
  --filter "until=${AION_IMAGE_PRUNE_UNTIL:-72h}"
