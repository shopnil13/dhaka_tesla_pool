import type { FareBreakdown, PassengerRide, RideSummary } from '@teslapool/shared';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import { poolMemberships, pools, rideRequests, users, vehicles, zones } from '../../db/schema';
import { NotFoundError } from '../../lib/errors';

const pickupZone = alias(zones, 'pickup_zone');
const dropoffZone = alias(zones, 'dropoff_zone');

const ACTIVE_STATUSES = ['REQUESTED', 'MATCHED', 'IN_PROGRESS'] as const;

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * One ride, as its passenger sees it. Every lookup is scoped to the
 * passenger, so someone else's ride is indistinguishable from a missing one.
 */
export async function getPassengerRide(
  passengerId: string,
  rideId: string,
): Promise<PassengerRide> {
  const [row] = await db
    .select({ ride: rideRequests, pickup: pickupZone, dropoff: dropoffZone })
    .from(rideRequests)
    .innerJoin(pickupZone, eq(pickupZone.id, rideRequests.pickupZoneId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)));
  if (!row) throw new NotFoundError('Ride not found');

  const [seat] = await db
    .select({
      pool: pools,
      dropoffOrder: poolMemberships.dropoffOrder,
      driverName: users.name,
      vehicle: { name: vehicles.name, plate: vehicles.plate, capacity: vehicles.capacity },
    })
    .from(poolMemberships)
    .innerJoin(pools, eq(pools.id, poolMemberships.poolId))
    .innerJoin(users, eq(users.id, pools.driverId))
    .innerJoin(vehicles, eq(vehicles.id, pools.vehicleId))
    .where(and(eq(poolMemberships.rideRequestId, rideId), isNull(poolMemberships.leftAt)));

  const coRiders = seat
    ? await db.$count(
        poolMemberships,
        and(
          eq(poolMemberships.poolId, seat.pool.id),
          isNull(poolMemberships.leftAt),
          ne(poolMemberships.rideRequestId, rideId),
        ),
      )
    : 0;

  const { ride, pickup, dropoff } = row;
  return {
    id: ride.id,
    status: ride.status,
    pickupZone: pickup,
    dropoffZone: dropoff,
    seats: ride.seats,
    wantsShare: ride.wantsShare,
    paymentMethod: ride.paymentMethod,
    distanceM: ride.directDistanceM,
    quotedFarePoisha: ride.quotedFarePoisha,
    finalFarePoisha: ride.finalFarePoisha,
    fareBreakdown: ride.fareBreakdown as FareBreakdown | null,
    cancellationFeePoisha: ride.cancellationFeePoisha,
    requestedAt: ride.requestedAt.toISOString(),
    matchedAt: iso(ride.matchedAt),
    startedAt: iso(ride.startedAt),
    completedAt: iso(ride.completedAt),
    cancelledAt: iso(ride.cancelledAt),
    pool: seat
      ? {
          id: seat.pool.id,
          status: seat.pool.status,
          driverName: seat.driverName,
          vehicle: seat.vehicle,
          seatsTaken: seat.pool.seatsTaken,
          coRiders,
          dropoffOrder: seat.dropoffOrder,
        }
      : null,
  };
}

/** The passenger's current ride, if any (there is at most one). */
export async function getActiveRide(passengerId: string): Promise<PassengerRide | null> {
  const [active] = await db
    .select({ id: rideRequests.id })
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.passengerId, passengerId),
        inArray(rideRequests.status, [...ACTIVE_STATUSES]),
      ),
    );
  return active ? getPassengerRide(passengerId, active.id) : null;
}

/** Newest first; capped because this is a screen, not an export. */
export async function listRides(passengerId: string, limit = 50): Promise<RideSummary[]> {
  const rows = await db
    .select({ ride: rideRequests, pickup: pickupZone.name, dropoff: dropoffZone.name })
    .from(rideRequests)
    .innerJoin(pickupZone, eq(pickupZone.id, rideRequests.pickupZoneId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    .where(eq(rideRequests.passengerId, passengerId))
    .orderBy(desc(rideRequests.requestedAt))
    .limit(limit);

  return rows.map(({ ride, pickup, dropoff }) => ({
    id: ride.id,
    status: ride.status,
    pickupZone: pickup,
    dropoffZone: dropoff,
    seats: ride.seats,
    wantsShare: ride.wantsShare,
    farePoisha: ride.finalFarePoisha ?? ride.quotedFarePoisha,
    requestedAt: ride.requestedAt.toISOString(),
  }));
}
