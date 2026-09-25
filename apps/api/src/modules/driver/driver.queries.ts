import type {
  DriverFeedItem,
  DriverHistory,
  DriverHistoryRider,
  DriverPool,
  DriverProfile,
} from '@teslapool/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import {
  driverProfiles,
  payments,
  poolMemberships,
  pools,
  ratings,
  rideRequests,
  users,
  vehicles,
  zones,
} from '../../db/schema';
import { checkCompatibility } from '../../domain/matching';
import { AppError } from '../../lib/errors';
import { driverRatingSummary } from '../ratings/ratings.service';
import { loadZoneMap } from '../zones/zones.service';

const dropoffZone = alias(zones, 'dropoff_zone');
const ACTIVE_POOL_STATUSES = ['ACCEPTED', 'DRIVER_ARRIVED', 'STARTED'] as const;
const FINISHED_POOL_STATUSES = ['COMPLETED', 'CANCELLED'] as const;

export async function getDriverProfile(driverId: string): Promise<DriverProfile> {
  const [row] = await db
    .select({ name: users.name, profile: driverProfiles, zone: zones, vehicle: vehicles })
    .from(driverProfiles)
    .innerJoin(users, eq(users.id, driverProfiles.userId))
    .innerJoin(vehicles, eq(vehicles.driverId, driverProfiles.userId))
    .leftJoin(zones, eq(zones.id, driverProfiles.currentZoneId))
    .where(eq(driverProfiles.userId, driverId));
  if (!row) throw new AppError(403, 'FORBIDDEN', 'No driver profile for this account');
  return {
    name: row.name,
    isOnline: row.profile.isOnline,
    zone: row.zone,
    vehicle: { name: row.vehicle.name, plate: row.vehicle.plate, capacity: row.vehicle.capacity },
  };
}

/** The driver's unfinished pool with everyone seated in it, in drop-off order. */
export async function getCurrentPool(driverId: string): Promise<DriverPool | null> {
  const [row] = await db
    .select({ pool: pools, pickupZone: zones.name })
    .from(pools)
    .innerJoin(zones, eq(zones.id, pools.pickupZoneId))
    .where(and(eq(pools.driverId, driverId), inArray(pools.status, [...ACTIVE_POOL_STATUSES])));
  if (!row) return null;

  const members = await db
    .select({
      ride: rideRequests,
      passengerName: users.name,
      dropoffZone: dropoffZone.name,
      dropoffOrder: poolMemberships.dropoffOrder,
    })
    .from(poolMemberships)
    .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    .where(and(eq(poolMemberships.poolId, row.pool.id), isNull(poolMemberships.leftAt)))
    .orderBy(asc(poolMemberships.dropoffOrder), asc(poolMemberships.joinedAt));

  // Unpaid cash fees from earlier rides are collected together with this fare.
  const passengerIds = members.map((m) => m.ride.passengerId);
  const dues = passengerIds.length
    ? await db
        .select({
          passengerId: payments.passengerId,
          total: sql<number>`sum(${payments.amountPoisha})::int`,
        })
        .from(payments)
        .where(and(inArray(payments.passengerId, passengerIds), eq(payments.status, 'DUE')))
        .groupBy(payments.passengerId)
    : [];
  const duesOf = (passengerId: string) =>
    dues.find((due) => due.passengerId === passengerId)?.total ?? 0;

  const { pool } = row;
  return {
    id: pool.id,
    status: pool.status,
    isShared: pool.isShared,
    pickupZone: row.pickupZone,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    acceptedAt: pool.acceptedAt.toISOString(),
    arrivedAt: pool.arrivedAt?.toISOString() ?? null,
    startedAt: pool.startedAt?.toISOString() ?? null,
    members: members.map((m) => ({
      rideRequestId: m.ride.id,
      passengerName: m.passengerName,
      seats: m.ride.seats,
      dropoffZone: m.dropoffZone,
      dropoffOrder: m.dropoffOrder,
      status: m.ride.status,
      paymentMethod: m.ride.paymentMethod,
      quotedFarePoisha: m.ride.quotedFarePoisha,
      finalFarePoisha: m.ride.finalFarePoisha,
      duesPoisha: duesOf(m.ride.passengerId),
    })),
  };
}

/**
 * Waiting requests in the driver's zone, oldest first, each with whether it
 * fits right now. Advisory only (no locks): accepting re-checks everything.
 */
export async function getDriverFeed(driverId: string): Promise<DriverFeedItem[]> {
  const [profile] = await db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, driverId));
  if (!profile?.isOnline || profile.currentZoneId === null) return [];

  const [waiting, currentPool, zoneMap, [vehicle]] = await Promise.all([
    db
      .select({ ride: rideRequests, passengerName: users.name, dropoffZone: dropoffZone.name })
      .from(rideRequests)
      .innerJoin(users, eq(users.id, rideRequests.passengerId))
      .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
      .where(
        and(
          eq(rideRequests.status, 'REQUESTED'),
          eq(rideRequests.pickupZoneId, profile.currentZoneId),
        ),
      )
      .orderBy(asc(rideRequests.requestedAt))
      .limit(20),
    getCurrentPool(driverId),
    loadZoneMap(),
    db.select().from(vehicles).where(eq(vehicles.driverId, driverId)),
  ]);

  const poolForCheck = currentPool && {
    status: currentPool.status,
    isShared: currentPool.isShared,
    pickupZoneId: profile.currentZoneId,
    capacity: currentPool.capacity,
    seatsTaken: currentPool.seatsTaken,
  };
  const members = await (currentPool
    ? db
        .select({
          rideRequestId: poolMemberships.rideRequestId,
          seats: poolMemberships.seats,
          dropoffZoneId: rideRequests.dropoffZoneId,
        })
        .from(poolMemberships)
        .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
        .where(and(eq(poolMemberships.poolId, currentPool.id), isNull(poolMemberships.leftAt)))
        .orderBy(asc(poolMemberships.joinedAt))
    : Promise.resolve([]));

  return waiting.map(({ ride, passengerName, dropoffZone: dropoff }) => {
    let reason: string | null = null;
    if (poolForCheck) {
      const result = checkCompatibility(
        poolForCheck,
        members,
        {
          rideRequestId: ride.id,
          pickupZoneId: ride.pickupZoneId,
          dropoffZoneId: ride.dropoffZoneId,
          seats: ride.seats,
          wantsShare: ride.wantsShare,
        },
        zoneMap.distance,
      );
      if (!result.ok) reason = result.message;
    } else if (vehicle && ride.seats > vehicle.capacity) {
      reason = `Needs ${ride.seats} seats`;
    }
    return {
      rideRequestId: ride.id,
      passengerName,
      seats: ride.seats,
      wantsShare: ride.wantsShare,
      dropoffZone: dropoff,
      distanceM: ride.directDistanceM,
      quotedFarePoisha: ride.quotedFarePoisha,
      requestedAt: ride.requestedAt.toISOString(),
      canAccept: reason === null,
      reason,
    };
  });
}

type MembershipRow = typeof poolMemberships.$inferSelect;
type RideRow = typeof rideRequests.$inferSelect;

/**
 * How a booking ended for the driver, and what it earned them: the fare when
 * dropped off, the late fee when the passenger cancelled after arrival (a
 * cash fee counts even while it is still owed), nothing when the driver
 * cancelled. getDriverHistory's SQL totals apply the same rules.
 */
function riderOutcome(membership: MembershipRow, ride: RideRow) {
  if (membership.leftReason === null) {
    return { outcome: 'DROPPED_OFF' as const, amountPoisha: ride.finalFarePoisha ?? 0 };
  }
  return {
    outcome: membership.leftReason,
    amountPoisha: membership.leftReason === 'PASSENGER_CANCELLED' ? ride.cancellationFeePoisha : 0,
  };
}

/**
 * The driver's finished pools (newest first, the latest `limit`) with who
 * rode, how each booking ended, what it earned and the stars it got, plus
 * lifetime totals computed over every finished pool, not just those listed.
 */
export async function getDriverHistory(driverId: string, limit = 20): Promise<DriverHistory> {
  const finishedPool = and(
    eq(pools.driverId, driverId),
    inArray(pools.status, [...FINISHED_POOL_STATUSES]),
  );
  const pastPools = await db
    .select({ pool: pools, pickupZone: zones.name })
    .from(pools)
    .innerJoin(zones, eq(zones.id, pools.pickupZoneId))
    .where(finishedPool)
    .orderBy(desc(pools.acceptedAt))
    .limit(limit);
  const poolIds = pastPools.map(({ pool }) => pool.id);

  const [riders, [totals], completedTrips, rating] = await Promise.all([
    poolIds.length
      ? db
          .select({
            membership: poolMemberships,
            ride: rideRequests,
            passengerName: users.name,
            dropoffZone: dropoffZone.name,
            stars: ratings.stars,
            comment: ratings.comment,
          })
          .from(poolMemberships)
          .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
          .innerJoin(users, eq(users.id, rideRequests.passengerId))
          .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
          // A rating belongs to the pool the ride finished in, not to one it was re-queued from.
          .leftJoin(
            ratings,
            and(eq(ratings.rideRequestId, rideRequests.id), isNull(poolMemberships.leftAt)),
          )
          .where(inArray(poolMemberships.poolId, poolIds))
          .orderBy(asc(poolMemberships.dropoffOrder), asc(poolMemberships.joinedAt))
      : Promise.resolve([]),
    db
      .select({
        ridersCarried: sql<number>`count(*) filter (where ${poolMemberships.leftReason} is null)::int`,
        fares: sql<number>`coalesce(sum(${rideRequests.finalFarePoisha}) filter (where ${poolMemberships.leftReason} is null), 0)::int`,
        lateFees: sql<number>`coalesce(sum(${rideRequests.cancellationFeePoisha}) filter (where ${poolMemberships.leftReason} = 'PASSENGER_CANCELLED'), 0)::int`,
      })
      .from(poolMemberships)
      .innerJoin(pools, eq(pools.id, poolMemberships.poolId))
      .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
      .where(finishedPool),
    db.$count(pools, and(eq(pools.driverId, driverId), eq(pools.status, 'COMPLETED'))),
    driverRatingSummary(driverId),
  ]);

  return {
    summary: {
      completedTrips,
      ridersCarried: totals?.ridersCarried ?? 0,
      earningsPoisha: (totals?.fares ?? 0) + (totals?.lateFees ?? 0),
      rating,
    },
    pools: pastPools.map(({ pool, pickupZone }) => {
      const poolRiders: DriverHistoryRider[] = riders
        .filter((r) => r.membership.poolId === pool.id)
        .map((r) => ({
          rideRequestId: r.ride.id,
          passengerName: r.passengerName,
          seats: r.membership.seats,
          dropoffZone: r.dropoffZone,
          paymentMethod: r.ride.paymentMethod,
          ...riderOutcome(r.membership, r.ride),
          rating: r.stars === null ? null : { stars: r.stars, comment: r.comment },
        }));
      return {
        id: pool.id,
        status: pool.status,
        isShared: pool.isShared,
        pickupZone,
        acceptedAt: pool.acceptedAt.toISOString(),
        endedAt: (pool.completedAt ?? pool.cancelledAt ?? pool.acceptedAt).toISOString(),
        riders: poolRiders,
        earningsPoisha: poolRiders.reduce((sum, rider) => sum + rider.amountPoisha, 0),
      };
    }),
  };
}
