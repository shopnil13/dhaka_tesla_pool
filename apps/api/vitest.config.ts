import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/support/testDatabaseUrl.ts';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/globalSetup.ts'],
    setupFiles: ['test/support/setup.ts'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Tests always run against the throwaway test database, never DATABASE_URL.
      DATABASE_URL: TEST_DATABASE_URL,
    },
  },
});
