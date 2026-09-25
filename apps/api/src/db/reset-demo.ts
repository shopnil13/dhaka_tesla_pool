import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { db, pgPool } from './client';
import { seedDatabase } from './seedDatabase';
import { truncateAllTables } from './truncate';

// Wipes all rides, pools and payments and re-seeds the story cast, so a demo
// (or the video) starts from the same world every time. Destructive, so it
// refuses to run against production unless explicitly allowed.
const { SEED_DEMO_PASSWORD, ALLOW_DEMO_RESET } = z
  .object({
    SEED_DEMO_PASSWORD: z.string().min(8),
    ALLOW_DEMO_RESET: z.stringbool().default(false),
  })
  .parse(process.env);

if (env.NODE_ENV === 'production' && !ALLOW_DEMO_RESET) {
  logger.fatal('Refusing to reset a production database (set ALLOW_DEMO_RESET=true to override)');
  process.exit(1);
}

try {
  await truncateAllTables(db);
  const result = await seedDatabase(db, SEED_DEMO_PASSWORD);
  logger.info(result, 'Demo data reset');
} catch (err) {
  logger.fatal({ err }, 'Demo reset failed');
  process.exitCode = 1;
} finally {
  await pgPool.end();
}
