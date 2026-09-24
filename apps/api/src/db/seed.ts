import { z } from 'zod';
import { logger } from '../lib/logger';
import { db, pgPool } from './client';
import { seedDatabase } from './seedDatabase';

const { SEED_DEMO_PASSWORD } = z
  .object({
    SEED_DEMO_PASSWORD: z.string().min(8, 'SEED_DEMO_PASSWORD must be at least 8 characters'),
  })
  .parse(process.env);

try {
  const result = await seedDatabase(db, SEED_DEMO_PASSWORD);
  logger.info(result, 'Seed complete');
} catch (err) {
  logger.fatal({ err }, 'Seed failed');
  process.exitCode = 1;
} finally {
  await pgPool.end();
}
