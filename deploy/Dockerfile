# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS node-base

WORKDIR /app

FROM node-base AS build-base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

FROM build-base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm db:generate && pnpm build

FROM build AS api-deploy

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm --filter @aion/api --prod deploy /prod/api

FROM build AS telegram-bot-deploy

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm --filter @aion/telegram-bot --prod deploy /prod/telegram-bot

FROM node-base AS runtime-base

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ARG AION_GIT_SHA
ARG AION_GIT_REF
ARG AION_GIT_REPOSITORY
ENV AION_GIT_SHA=$AION_GIT_SHA
ENV AION_GIT_REF=$AION_GIT_REF
ENV AION_GIT_REPOSITORY=$AION_GIT_REPOSITORY

LABEL org.opencontainers.image.source="https://github.com/${AION_GIT_REPOSITORY}" \
  org.opencontainers.image.revision="${AION_GIT_SHA}" \
  io.aion.runtime="true"

FROM runtime-base AS api

LABEL io.aion.service="api"
COPY --from=api-deploy --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=api-deploy --chown=node:node /prod/api/package.json ./package.json
COPY --from=api-deploy --chown=node:node /prod/api/dist ./dist
COPY --from=api-deploy --chown=node:node /prod/api/prisma ./prisma
COPY --from=api-deploy --chown=node:node /prod/api/prisma.config.ts ./prisma.config.ts
USER node

CMD ["node", "dist/main.js"]

FROM runtime-base AS telegram-bot

LABEL io.aion.service="telegram-bot"
COPY --from=telegram-bot-deploy --chown=node:node /prod/telegram-bot/node_modules ./node_modules
COPY --from=telegram-bot-deploy --chown=node:node /prod/telegram-bot/package.json ./package.json
COPY --from=telegram-bot-deploy --chown=node:node /prod/telegram-bot/dist ./dist
USER node

CMD ["node", "dist/index.js"]
