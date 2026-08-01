# AGENTS.md

- Use pnpm 11 and keep `apps/api`, `apps/telegram-bot`, and `packages/contracts` independent.
- Start feature branches from `development`; merge tested work into `development`, then `main`.
- Use `feature/<name>` for code and `docs/<name>` for documentation.
- Never commit `.env` files, tokens, SSH keys, or generated Prisma clients.
- Commit forward-compatible Prisma migrations with the code that needs them.
- Do not reset databases or run destructive migrations without explicit approval.
- Before handoff run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
