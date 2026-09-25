import { and, eq, isNull, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { db } from '../../src/db/client';
import { driverProfiles, poolMemberships, pools, rideRequests } from '../../src/db/schema';
import type { ZoneSlug } from '../../src/db/seed-data/zones';
import { quoteFare } from '../../src/domain/fare';
import { loadCast } from './db';
import { seedDistances, zoneIdOf } from './zones';

type Passenger = 'nusrat' | 'rafiq' | 'shirin';

interface Aboard {
  passenger: Passenger;
  to: ZoneSlug;
  seats?: number;
}

/**
 * Jashim online in Bullet with an ACCEPTED pool holding these passengers, as
 * if he had accepted them. Written straight to the tables so pooling tests do
 * not depend on the driver endpoints.
 */
export async function jashimsPoolWith(
  aboard: Aboard[],
  { from = 'banani', shared = true }: { from?: ZoneSlug; shared?: boolean } = {},
) {
  const cast = await loadCast();
  const pickupZoneId = zoneIdOf(from);
  await db
    .update(driverProfiles)
    .set({ isOnline: true, currentZoneId: pickupZoneId })
    .where(eq(driverProfiles.userId, cast.jashim));

  return db.transaction(async (tx) => {
    const [pool] = await tx
      .insert(pools)
      .values({
        driverId: cast.jashim,
        vehicleId: cast.bullet.id,
        pickupZoneId,
        isShared: shared,
        capacity: cast.bullet.capacity,
        seatsTaken: aboard.reduce((total, rider) => total + (rider.seats ?? 1), 0),
      })
      .returning();

    for (const [index, rider] of aboard.entries()) {
      const seats = rider.seats ?? 1;
      const distanceM = seedDistances(pickupZoneId, zoneIdOf(rider.to));
      const [ride] = await tx
        .insert(rideRequests)
        .values({
          passengerId: cast[rider.passenger],
          pickupZoneId,
          dropoffZoneId: zoneIdOf(rider.to),
          seats,
          wantsShare: shared,
          paymentMethod: 'CASH',
          status: 'MATCHED',
          matchedAt: new Date(),
          directDistanceM: distanceM,
          quotedFarePoisha: quoteFare({ distanceM, seats, wantsShare: shared }).totalPoisha,
        })
        .returning();
      await tx.insert(poolMemberships).values({
        poolId: pool!.id,
        rideRequestId: ride!.id,
        seats,
        joinedAt: new Date(Date.now() - 60_000 + index), // earlier than any new joiner
      });
    }
    return pool!;
  });
}

/** The pool invariant: its seat counter matches its members and never exceeds capacity. */
export async function expectPoolConsistent(poolId: string) {
  const [pool] = await db.select().from(pools).where(eq(pools.id, poolId));
  const [members] = await db
    .select({ seats: sql<number>`coalesce(sum(${poolMemberships.seats}), 0)::int` })
    .from(poolMemberships)
    .where(and(eq(poolMemberships.poolId, poolId), isNull(poolMemberships.leftAt)));

  expect(pool!.seatsTaken, 'seats_taken equals the seats of active members').toBe(members!.seats);
  expect(pool!.seatsTaken).toBeLessThanOrEqual(pool!.capacity);
  return pool!;
}
