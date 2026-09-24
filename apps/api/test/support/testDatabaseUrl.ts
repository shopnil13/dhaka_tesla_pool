export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://teslapool:teslapool@localhost:5433/teslapool_test';

// Tests truncate every table. Refuse to run against anything that is not
// clearly a test database, so a misconfigured env can never wipe real data.
const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${dbName}": database name must end with _test`);
}
