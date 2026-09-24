import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { TEST_DATABASE_URL } from './testDatabaseUrl';

/** Runs once before all test files: bring the test database schema up to date. */
export default async function setup() {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'migrations' });
  } finally {
    await pool.end();
  }
}
