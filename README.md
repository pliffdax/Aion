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
Leave `TELEGRAM_ALLOWED_USER_IDS` empty to expose user commands publicly. Setting one or more
IDs enables restricted access for a dev/test bot; `TELEGRAM_OWNER_ID` remains allowed and keeps
exclusive access to owner commands.

## Branches

Create `feature/*` branches from `development`. Merges into `development` deploy the test stack; merges from `development` into `main` deploy production.
