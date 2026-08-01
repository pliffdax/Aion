# Aion

Personal Telegram assistant for daily plans, reports, and reminders.

## Local setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/telegram-bot/.env.example apps/telegram-bot/.env
pnpm docker:up
pnpm db:migrate:dev
pnpm dev:api
pnpm dev:telegram-bot:test
```

Use a separate BotFather token in `BOT_TOKEN_TEST`. `API_KEY` must match in both local env files.

## Branches

Create `feature/*` branches from `development`. Merges into `development` deploy the test stack; merges from `development` into `main` deploy production.
