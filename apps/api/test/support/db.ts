import { eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { db } from '../../src/db/client';
import { users, vehicles, zones } from '../../src/db/schema';
import { seedDatabase } from '../../src/db/seedDatabase';

export const TEST_PASSWORD = 'bullet-test-password';

/** Empties every table and re-seeds the story cast, so each test starts from the same world. */
export async function resetDatabase() {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
  await seedDatabase(db, TEST_PASSWORD);
}

async function userId(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`Seeded user missing: ${email}`);
  return user.id;
}

/** Ids of the seeded cast and zones, looked up after a reset. */
export async function loadCast() {
  const [jashim, nusrat, rafiq, shirin] = await Promise.all([
    userId('jashim@teslapool.test'),
    userId('nusrat@teslapool.test'),
    userId('rafiq@teslapool.test'),
    userId('shirin@teslapool.test'),
  ]);
  const [bullet] = await db.select().from(vehicles).where(eq(vehicles.driverId, jashim));
  const zoneRows = await db.select().from(zones);
  const zone = (slug: string) => {
    const found = zoneRows.find((z) => z.slug === slug);
    if (!found) throw new Error(`Seeded zone missing: ${slug}`);
    return found.id;
  };
  return { jashim, nusrat, rafiq, shirin, bullet: bullet!, zone };
}

/** Asserts that a write was rejected by Postgres because of the named constraint. */
export async function expectConstraintViolation(write: Promise<unknown>, constraint: string) {
  const error = await write.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error, `expected Postgres to reject the write via ${constraint}`).not.toBeNull();
  // Drizzle wraps the driver error; the pg error with the constraint name is the cause.
  const pgError = (error as { cause?: { constraint?: string } }).cause ?? error;
  expect((pgError as { constraint?: string }).constraint).toBe(constraint);
}
