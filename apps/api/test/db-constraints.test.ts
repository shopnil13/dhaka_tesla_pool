import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import {
  payments,
  pools,
  rideRequests,
  walletAccounts,
  walletTransactions,
} from '../src/db/schema';
import { expectConstraintViolation, loadCast, resetDatabase } from './support/db';

// These tests write to the tables directly, bypassing the services on
// purpose: they prove the database itself refuses corrupt data, so a bug in
// application code still cannot overbook Bullet or overcharge anyone.

let cast: Awaited<ReturnType<typeof loadCast>>;

beforeEach(async () => {
  await resetDatabase();
  cast = await loadCast();
});

async function openPoolForJashim(overrides: Partial<typeof pools.$inferInsert> = {}) {
  const [pool] = await db
    .insert(pools)
    .values({
      driverId: cast.jashim,
      vehicleId: cast.bullet.id,
      pickupZoneId: cast.zone('banani'),
      isShared: true,
      capacity: cast.bullet.capacity,
      ...overrides,
    })
    .returning();
  return pool!;
}

async function requestRide(
  passengerId: string,
  overrides: Partial<typeof rideRequests.$inferInsert> = {},
) {
  const [ride] = await db
    .insert(rideRequests)
    .values({
      passengerId,
      pickupZoneId: cast.zone('banani'),
      dropoffZoneId: cast.zone('mohakhali'),
      seats: 1,
      wantsShare: true,
      paymentMethod: 'TESLAPAY',
      directDistanceM: 2500,
      quotedFarePoisha: 7200,
      ...overrides,
    })
    .returning();
  return ride!;
}

describe('database guarantees', () => {
  it("never lets Bullet's taken seats exceed its capacity", async () => {
    const pool = await openPoolForJashim({ seatsTaken: 3 });

    await expectConstraintViolation(
      db.update(pools).set({ seatsTaken: 4 }).where(eq(pools.id, pool.id)),
      'pools_seats_within_capacity',
    );
  });

  it('gives Jashim at most one active pool at a time', async () => {
    const first = await openPoolForJashim();
    await expectConstraintViolation(openPoolForJashim(), 'pools_one_active_per_driver');

    // Once that trip is over he can accept a new one.
    await db.update(pools).set({ status: 'COMPLETED' }).where(eq(pools.id, first.id));
    await expect(openPoolForJashim()).resolves.toMatchObject({ status: 'ACCEPTED' });
  });

  it('gives Nusrat at most one active ride request, which also blocks double submits', async () => {
    const first = await requestRide(cast.nusrat);
    await expectConstraintViolation(
      requestRide(cast.nusrat),
      'ride_requests_one_active_per_passenger',
    );

    await db
      .update(rideRequests)
      .set({ status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'PASSENGER' })
      .where(eq(rideRequests.id, first.id));
    await expect(requestRide(cast.nusrat)).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('never charges more than the upfront quote', async () => {
    const ride = await requestRide(cast.nusrat, { quotedFarePoisha: 7200 });

    await expectConstraintViolation(
      db.update(rideRequests).set({ finalFarePoisha: 7201 }).where(eq(rideRequests.id, ride.id)),
      'ride_requests_final_within_quote',
    );
    await expect(
      db.update(rideRequests).set({ finalFarePoisha: 6300 }).where(eq(rideRequests.id, ride.id)),
    ).resolves.toBeDefined();
  });

  it("never lets Shirin's TeslaPay balance go below zero", async () => {
    // Shirin has ৳50; a ৳72 debit would overdraw her.
    await expectConstraintViolation(
      db
        .update(walletAccounts)
        .set({ balancePoisha: sql`${walletAccounts.balancePoisha} - 7200` })
        .where(eq(walletAccounts.userId, cast.shirin)),
      'wallet_accounts_balance_non_negative',
    );
  });

  it('debits a payment from the wallet at most once', async () => {
    const ride = await requestRide(cast.nusrat);
    const [payment] = await db
      .insert(payments)
      .values({
        passengerId: cast.nusrat,
        rideRequestId: ride.id,
        purpose: 'FARE',
        method: 'TESLAPAY',
        amountPoisha: 7200,
        status: 'PAID',
        paidAt: new Date(),
      })
      .returning();
    const debit = {
      userId: cast.nusrat,
      paymentId: payment!.id,
      type: 'DEBIT' as const,
      amountPoisha: -7200,
      balanceAfterPoisha: 42_800,
    };
    await db.insert(walletTransactions).values(debit);

    await expectConstraintViolation(
      db.insert(walletTransactions).values({ ...debit, balanceAfterPoisha: 35_600 }),
      'wallet_transactions_payment_id_unique',
    );
  });
});
