# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.9.0 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/telegram-bot/package.json apps/telegram-bot/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN pnpm db:generate && pnpm build

FROM base AS runtime

ENV NODE_ENV=production

ARG APP
ARG AION_GIT_SHA
ARG AION_GIT_REF
ARG AION_GIT_REPOSITORY
ENV AION_APP=$APP
ENV AION_GIT_SHA=$AION_GIT_SHA
ENV AION_GIT_REF=$AION_GIT_REF
ENV AION_GIT_REPOSITORY=$AION_GIT_REPOSITORY

COPY --from=build /app /app

CMD ["sh", "-c", "case \"$AION_APP\" in api) cd apps/api && exec node dist/main.js ;; telegram-bot) cd apps/telegram-bot && exec node dist/index.js ;; *) echo \"Unknown AION_APP=$AION_APP\" >&2; exit 1 ;; esac"]
