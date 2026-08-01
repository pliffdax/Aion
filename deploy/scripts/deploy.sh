#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHARED_DIR="${AION_SHARED_DIR:-/srv/aion/shared}"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"

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

docker compose -f "$COMPOSE_FILE" pull postgres api telegram-bot
docker compose -f "$COMPOSE_FILE" up -d postgres --wait
docker compose -f "$COMPOSE_FILE" run --rm api pnpm --filter @aion/api db:migrate:deploy
docker compose -f "$COMPOSE_FILE" up -d --wait api telegram-bot
docker compose -f "$COMPOSE_FILE" ps
