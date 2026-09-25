import { sql } from 'drizzle-orm';
import type { Db } from './client';

/** Empties every application table (migration history is in another schema and kept). */
export async function truncateAllTables(db: Db) {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}
