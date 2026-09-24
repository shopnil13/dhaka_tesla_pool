import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Tests always run against the throwaway test database, never DATABASE_URL.
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        'postgres://teslapool:teslapool@localhost:5433/teslapool_test',
    },
  },
});
