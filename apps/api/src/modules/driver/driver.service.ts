import type { DriverStatusInput } from '@teslapool/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, type Tx } from '../../db/client';
import { driverProfiles, poolMemberships, pools, rideRequests } from '../../db/schema';
import { finalFare } from '../../domain/fare';
import { checkCompatibility, planRoute } from '../../domain/matching';
import { assertPoolTransition, assertRideTransition } from '../../domain/stateMachine';
import { AppError, NotFoundError } from '../../lib/errors';
import { recordEvent } from '../../lib/events';
import {
  activeMembers,
  asJoinCandidate,
  findActivePoolId,
  joinPool,
  lockPool,
  lockRide,
  type PoolRow,
} from '../pools/pools.repository';
import { chargeRide } from '../payments/payments.service';
import { assertKnownZones, loadZoneMap } from '../zones/zones.service';
import { lockDriver } from './driver.repository';

/** Locks a pool and makes sure it is this driver's; someone else's pool is a 404. */
async function lockOwnPool(tx: Tx, driverId: string, poolId: string): Promise<PoolRow> {
  const pool = await lockPool(tx, poolId);
  if (pool.driverId !== driverId) throw new NotFoundError('Pool not found');
  return pool;
}

/** Rides currently seated in the pool (memberships not left), with their rows. */
function seatedRides(tx: Tx, poolId: string) {
  return tx
    .select({ ride: rideRequests })
    .from(poolMemberships)
    .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
    .where(and(eq(poolMemberships.poolId, poolId), isNull(poolMemberships.leftAt)));
}

/** Go online/offline or move zones. Not while a pool is under way. */
export async function updateDriverStatus(driverId: string, input: DriverStatusInput) {
  assertKnownZones(await loadZoneMap(), { currentZoneId: input.currentZoneId });
  await db.transaction(async (tx) => {
    const { profile } = await lockDriver(tx, driverId);
    const changes =
      input.isOnline !== profile.isOnline || input.currentZoneId !== profile.currentZoneId;
    if (changes && (await findActivePoolId(tx, driverId))) {
      throw new AppError(
        409,
        'ACTIVE_POOL_EXISTS',
        'Finish or cancel your current pool before going offline or changing zone',
      );
    }
    await tx
      .update(driverProfiles)
      .set({ isOnline: input.isOnline, currentZoneId: input.currentZoneId, updatedAt: new Date() })
      .where(eq(driverProfiles.userId, driverId));
  });
}

/**
 * The driver takes a waiting request: into the current pool if it fits,
 * otherwise as the first passenger of a new pool. Two drivers (or two clicks)
 * racing for the same request: the ride row lock lets exactly one win; the
 * other finds it no longer REQUESTED.
 */
export async function acceptRequest(driverId: string, rideId: string) {
  const zoneMap = await loadZoneMap();
  await db.transaction(async (tx) => {
    const { profile, vehicle } = await lockDriver(tx, driverId);
    if (!profile.isOnline || profile.currentZoneId === null) {
      throw new AppError(409, 'DRIVER_OFFLINE', 'Go online to accept requests');
    }
    const currentPoolId = await findActivePoolId(tx, driverId);
    const pool = currentPoolId ? await lockPool(tx, currentPoolId) : null;
    const ride = await lockRide(tx, rideId);

    if (ride.status !== 'REQUESTED') {
      throw new AppError(409, 'REQUEST_UNAVAILABLE', 'This request was already taken or cancelled');
    }
    if (ride.pickupZoneId !== profile.currentZoneId) {
      throw new AppError(422, 'NOT_COMPATIBLE', 'This passenger is waiting in another zone');
    }

    if (pool) {
      const members = await activeMembers(tx, pool.id);
      const result = checkCompatibility(pool, members, asJoinCandidate(ride), zoneMap.distance);
      if (!result.ok) {
        throw new AppError(422, 'NOT_COMPATIBLE', result.message, { reason: result.reason });
      }
      await joinPool(tx, {
        pool,
        ride,
        route: result.route,
        actorId: driverId,
        actorRole: 'DRIVER',
        reason: 'Accepted into the current pool',
      });
      return;
    }

    if (ride.seats > vehicle.capacity) {
      throw new AppError(
        422,
        'NOT_COMPATIBLE',
        `Needs ${ride.seats} seats; ${vehicle.name} has ${vehicle.capacity}`,
      );
    }
    const [created] = await tx
      .insert(pools)
      .values({
        driverId,
        vehicleId: vehicle.id,
        pickupZoneId: ride.pickupZoneId,
        isShared: ride.wantsShare,
        capacity: vehicle.capacity,
      })
      .returning();
    await recordEvent(tx, {
      poolId: created!.id,
      from: null,
      to: 'ACCEPTED',
      actorId: driverId,
      actorRole: 'DRIVER',
      metadata: { vehicle: vehicle.name, capacity: vehicle.capacity, shared: ride.wantsShare },
    });
    await joinPool(tx, {
      pool: created!,
      ride,
      route: planRoute(ride.pickupZoneId, [asJoinCandidate(ride)], zoneMap.distance),
      actorId: driverId,
      actorRole: 'DRIVER',
      reason: 'Accepted by the driver',
    });
  });
}

/** At the pickup. From here the pool takes no new passengers. */
export async function markArrived(driverId: string, poolId: string) {
  await db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    const pool = await lockOwnPool(tx, driverId, poolId);
    assertPoolTransition(pool.status, 'DRIVER_ARRIVED');
    await tx
      .update(pools)
      .set({ status: 'DRIVER_ARRIVED', arrivedAt: new Date() })
      .where(eq(pools.id, pool.id));
    await recordEvent(tx, {
      poolId,
      from: pool.status,
      to: 'DRIVER_ARRIVED',
      actorId: driverId,
      actorRole: 'DRIVER',
    });
  });
}

/**
 * Everyone is aboard. Each passenger's fare is re-priced for the riders
 * actually on board and frozen (never above their quote), with a breakdown
 * snapshot kept for history.
 */
export async function startTrip(driverId: string, poolId: string) {
  await db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    const pool = await lockOwnPool(tx, driverId, poolId);
    assertPoolTransition(pool.status, 'STARTED');
    const aboard = await seatedRides(tx, pool.id);
    if (aboard.length === 0) throw new AppError(409, 'CONFLICT', 'Nobody is aboard');

    const startedAt = new Date();
    for (const { ride } of aboard) {
      assertRideTransition(ride.status, 'IN_PROGRESS');
      const fare = finalFare(
        { distanceM: ride.directDistanceM, seats: ride.seats, wantsShare: ride.wantsShare },
        aboard.length,
        ride.quotedFarePoisha,
      );
      await tx
        .update(rideRequests)
        .set({
          status: 'IN_PROGRESS',
          startedAt,
          finalFarePoisha: fare.totalPoisha,
          fareBreakdown: fare,
        })
        .where(eq(rideRequests.id, ride.id));
      await recordEvent(tx, {
        rideRequestId: ride.id,
        from: ride.status,
        to: 'IN_PROGRESS',
        actorId: driverId,
        actorRole: 'DRIVER',
        metadata: { finalFarePoisha: fare.totalPoisha, ridersAtStart: aboard.length },
      });
    }
    await tx.update(pools).set({ status: 'STARTED', startedAt }).where(eq(pools.id, pool.id));
    await recordEvent(tx, {
      poolId,
      from: pool.status,
      to: 'STARTED',
      actorId: driverId,
      actorRole: 'DRIVER',
      metadata: { riders: aboard.length, seatsTaken: pool.seatsTaken },
    });
  });
}

/**
 * One passenger reaches their destination. When the last one is dropped off
 * the pool completes and the driver is now waiting in that zone.
 */
export async function dropOff(driverId: string, poolId: string, rideId: string) {
  await db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    const pool = await lockOwnPool(tx, driverId, poolId);
    const ride = await lockRide(tx, rideId);
    const [seat] = await tx
      .select({ id: poolMemberships.id })
      .from(poolMemberships)
      .where(
        and(
          eq(poolMemberships.poolId, pool.id),
          eq(poolMemberships.rideRequestId, ride.id),
          isNull(poolMemberships.leftAt),
        ),
      );
    if (!seat) throw new NotFoundError('This passenger is not in your pool');
    assertRideTransition(ride.status, 'COMPLETED');

    await tx
      .update(rideRequests)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(rideRequests.id, ride.id));
    // Pay in the same transaction: a drop-off without its payment cannot commit.
    const charged = await chargeRide(tx, ride);
    await recordEvent(tx, {
      rideRequestId: ride.id,
      from: ride.status,
      to: 'COMPLETED',
      actorId: driverId,
      actorRole: 'DRIVER',
      reason: 'Dropped off',
      metadata: charged,
    });

    const [{ stillRiding } = { stillRiding: 0 }] = await tx
      .select({ stillRiding: sql<number>`count(*)::int` })
      .from(poolMemberships)
      .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
      .where(
        and(
          eq(poolMemberships.poolId, pool.id),
          isNull(poolMemberships.leftAt),
          eq(rideRequests.status, 'IN_PROGRESS'),
        ),
      );
    if (stillRiding > 0) return;

    assertPoolTransition(pool.status, 'COMPLETED');
    await tx
      .update(pools)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(pools.id, pool.id));
    await tx
      .update(driverProfiles)
      .set({ currentZoneId: ride.dropoffZoneId, updatedAt: new Date() })
      .where(eq(driverProfiles.userId, driverId));
    await recordEvent(tx, {
      poolId,
      from: pool.status,
      to: 'COMPLETED',
      actorId: null,
      actorRole: 'SYSTEM',
      reason: 'Last passenger dropped off',
    });
  });
}

/**
 * The driver calls the trip off before it starts. Nobody is charged: every
 * passenger goes back to REQUESTED (visible to other drivers again) and the
 * membership rows are kept, closed with the reason, so history survives.
 */
export async function cancelPool(driverId: string, poolId: string) {
  await db.transaction(async (tx) => {
    await lockDriver(tx, driverId);
    const pool = await lockOwnPool(tx, driverId, poolId);
    assertPoolTransition(pool.status, 'CANCELLED');
    const now = new Date();

    for (const { ride } of await seatedRides(tx, pool.id)) {
      assertRideTransition(ride.status, 'REQUESTED');
      await tx
        .update(poolMemberships)
        .set({ leftAt: now, leftReason: 'DRIVER_CANCELLED' })
        .where(and(eq(poolMemberships.rideRequestId, ride.id), isNull(poolMemberships.leftAt)));
      await tx
        .update(rideRequests)
        .set({ status: 'REQUESTED', matchedAt: null })
        .where(eq(rideRequests.id, ride.id));
      await recordEvent(tx, {
        rideRequestId: ride.id,
        from: ride.status,
        to: 'REQUESTED',
        actorId: driverId,
        actorRole: 'DRIVER',
        reason: 'The driver cancelled the pool; back in the queue at no charge',
        metadata: { poolId },
      });
    }
    await tx
      .update(pools)
      .set({ status: 'CANCELLED', cancelledAt: now, seatsTaken: 0 })
      .where(eq(pools.id, pool.id));
    await recordEvent(tx, {
      poolId,
      from: pool.status,
      to: 'CANCELLED',
      actorId: driverId,
      actorRole: 'DRIVER',
    });
  });
}
