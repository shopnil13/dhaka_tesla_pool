import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import {
  users,
  vehicles,
  walletAccounts,
  walletTransactions,
  zoneDistances,
} from '../src/db/schema';
import { seedDatabase } from '../src/db/seedDatabase';
import { loadCast, resetDatabase, TEST_PASSWORD } from './support/db';

beforeEach(resetDatabase);

describe('seed', () => {
  it('creates the story cast: Jashim drives Bullet, a three-seat Tesla', async () => {
    const cast = await loadCast();
    const [driver] = await db.select().from(users).where(eq(users.id, cast.jashim));

    expect(driver?.role).toBe('DRIVER');
    expect(cast.bullet).toMatchObject({ name: 'Bullet', capacity: 3 });
    expect(await db.$count(zoneDistances)).toBe(72); // 36 pairs, both directions
  });

  it('is idempotent: re-running creates nobody and leaves wallets untouched', async () => {
    const before = await db.select().from(walletAccounts);

    const result = await seedDatabase(db, TEST_PASSWORD);

    expect(result).toMatchObject({ usersCreated: 0, usersSkipped: 4 });
    expect(await db.select().from(walletAccounts)).toEqual(before);
    expect(await db.$count(vehicles)).toBe(1);
  });

  it('keeps every wallet balance equal to the sum of its ledger', async () => {
    const rows = await db
      .select({
        balance: walletAccounts.balancePoisha,
        ledger: sql<number>`sum(${walletTransactions.amountPoisha})::int`,
      })
      .from(walletAccounts)
      .innerJoin(walletTransactions, eq(walletTransactions.userId, walletAccounts.userId))
      .groupBy(walletAccounts.userId);

    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.ledger).toBe(row.balance);
  });
});
