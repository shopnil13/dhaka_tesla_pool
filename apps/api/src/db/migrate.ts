import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { logger } from '../lib/logger';
import { db, pgPool } from './client';

// Applies every pending SQL migration in ./migrations (relative to apps/api).
// Drizzle records applied migrations in drizzle.__drizzle_migrations, so this
// is safe to run on every deploy.
try {
  await migrate(db, { migrationsFolder: 'migrations' });
  logger.info('Migrations applied');
} catch (err) {
  logger.fatal({ err }, 'Migration failed');
  process.exitCode = 1;
} finally {
  await pgPool.end();
}
