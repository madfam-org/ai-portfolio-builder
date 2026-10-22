import { defineConfig } from 'drizzle-kit';

/** `pnpm db:generate` writes SQL migrations to ./drizzle from the schema; no database connection is needed. */
export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
