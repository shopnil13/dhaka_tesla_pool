import type { DriverFeedItem, DriverPool, DriverProfile } from '@teslapool/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import {
  driverProfiles,
  poolMemberships,
  pools,
  rideRequests,
  users,
  vehicles,
  zones,
} from '../../db/schema';
import { checkCompatibility } from '../../domain/matching';
import { AppError } from '../../lib/errors';
import { loadZoneMap } from '../zones/zones.service';

const dropoffZone = alias(zones, 'dropoff_zone');
const ACTIVE_POOL_STATUSES = ['ACCEPTED', 'DRIVER_ARRIVED', 'STARTED'] as const;

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
