import type {
  FareBreakdown,
  PassengerRide,
  RideSummary,
  RideTimelineEntry,
} from '@teslapool/shared';
import { and, asc, desc, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import {
  payments,
  poolMemberships,
  pools,
  ratings,
  rideEvents,
  rideRequests,
  users,
  vehicles,
  zones,
} from '../../db/schema';
import { passengerCancellation } from '../../domain/cancellation';
import { describeRideEvent } from '../../domain/timeline';
import { NotFoundError } from '../../lib/errors';
import { driverRatingSummary } from '../ratings/ratings.service';

const pickupZone = alias(zones, 'pickup_zone');
const dropoffZone = alias(zones, 'dropoff_zone');
const actor = alias(users, 'actor');

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

  const [rating] = await db
    .select({ stars: ratings.stars, comment: ratings.comment, createdAt: ratings.createdAt })
    .from(ratings)
    .where(eq(ratings.rideRequestId, rideId));
  const driverRating = seat ? await driverRatingSummary(seat.pool.driverId) : null;

  const paymentRows = await db
    .select({
      purpose: payments.purpose,
      method: payments.method,
      status: payments.status,
      amountPoisha: payments.amountPoisha,
    })
    .from(payments)
    .where(eq(payments.rideRequestId, rideId))
    .orderBy(asc(payments.createdAt));

  const { ride, pickup, dropoff } = row;
  const cancellation = passengerCancellation(ride.status, seat?.pool.status ?? null);
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
    cancellation: cancellation.allowed
      ? { allowed: true, feePoisha: cancellation.feePoisha }
      : { allowed: false, feePoisha: 0 },
    payments: paymentRows,
    rating: rating ? { ...rating, createdAt: rating.createdAt.toISOString() } : null,
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
          driverRating,
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
    .select({
      ride: rideRequests,
      pickup: pickupZone.name,
      dropoff: dropoffZone.name,
      driverName: users.name,
      stars: ratings.stars,
    })
    .from(rideRequests)
    .innerJoin(pickupZone, eq(pickupZone.id, rideRequests.pickupZoneId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    // The pool the ride is (or finished) in; a cancelled ride has left its pool.
    .leftJoin(
      poolMemberships,
      and(eq(poolMemberships.rideRequestId, rideRequests.id), isNull(poolMemberships.leftAt)),
    )
    .leftJoin(pools, eq(pools.id, poolMemberships.poolId))
    .leftJoin(users, eq(users.id, pools.driverId))
    .leftJoin(ratings, eq(ratings.rideRequestId, rideRequests.id))
    .where(eq(rideRequests.passengerId, passengerId))
    .orderBy(desc(rideRequests.requestedAt))
    .limit(limit);

  return rows.map(({ ride, pickup, dropoff, driverName, stars }) => ({
    id: ride.id,
    status: ride.status,
    pickupZone: pickup,
    dropoffZone: dropoff,
    seats: ride.seats,
    wantsShare: ride.wantsShare,
    farePoisha: ride.finalFarePoisha ?? ride.quotedFarePoisha,
    driverName,
    stars,
    requestedAt: ride.requestedAt.toISOString(),
  }));
}

/**
 * The ride's history as plain-language lines, oldest first: the ride's own
 * events, plus the one pool event those do not already tell — the driver
 * arriving at the pickup — for pools the passenger was still in at that
 * moment (someone who cancelled earlier never sees a later arrival).
 * Events in one transaction share a timestamp, so the id breaks ties.
 */
export async function getRideTimeline(
  passengerId: string,
  rideId: string,
): Promise<RideTimelineEntry[]> {
  const [row] = await db
    .select({ ride: rideRequests, pickup: pickupZone.name, dropoff: dropoffZone.name })
    .from(rideRequests)
    .innerJoin(pickupZone, eq(pickupZone.id, rideRequests.pickupZoneId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)));
  if (!row) throw new NotFoundError('Ride not found');

  const fields = { event: rideEvents, actorName: actor.name };
  const [own, arrivals] = await Promise.all([
    db
      .select(fields)
      .from(rideEvents)
      .leftJoin(actor, eq(actor.id, rideEvents.actorId))
      .where(eq(rideEvents.rideRequestId, rideId)),
    db
      .select(fields)
      .from(rideEvents)
      .innerJoin(pools, eq(pools.id, rideEvents.poolId))
      .innerJoin(
        poolMemberships,
        and(eq(poolMemberships.poolId, pools.id), eq(poolMemberships.rideRequestId, rideId)),
      )
      .leftJoin(actor, eq(actor.id, rideEvents.actorId))
      .where(
        and(
          eq(rideEvents.toStatus, 'DRIVER_ARRIVED'),
          // Both timestamps come from the API's clock, so they compare safely.
          or(isNull(poolMemberships.leftAt), lte(pools.arrivedAt, poolMemberships.leftAt)),
        ),
      ),
  ]);

  const context = {
    pickupZone: row.pickup,
    dropoffZone: row.dropoff,
    paymentMethod: row.ride.paymentMethod,
  };
  return [...own, ...arrivals]
    .sort(
      (a, b) =>
        a.event.createdAt.getTime() - b.event.createdAt.getTime() || a.event.id - b.event.id,
    )
    .map(({ event, actorName }) => ({
      id: event.id,
      at: event.createdAt.toISOString(),
      ...describeRideEvent(
        {
          subject: event.poolId ? 'POOL' : 'RIDE',
          from: event.fromStatus,
          to: event.toStatus,
          actorRole: event.actorRole,
          actorName,
          reason: event.reason,
          metadata: event.metadata,
        },
        context,
      ),
    }));
}
