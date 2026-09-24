import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` diffs the TypeScript schema against the previous
// snapshot and writes a plain SQL migration into ./migrations (committed).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
