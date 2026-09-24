import { afterAll } from 'vitest';
import { pgPool } from '../../src/db/client';

// Each test file gets its own module graph (and so its own connection pool).
afterAll(async () => {
  await pgPool.end();
});
