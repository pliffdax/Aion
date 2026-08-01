import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const mode = process.env.MODE ?? 'dev';
const databaseUrl = mode === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Prisma generate still loads this config in CI, where no database is needed.
    url: databaseUrl ?? 'postgresql://aion:aion@localhost:5444/aion?schema=public',
  },
});
