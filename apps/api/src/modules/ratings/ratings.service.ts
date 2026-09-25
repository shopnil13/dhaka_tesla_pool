import type { DriverRatingSummary, RateRideInput } from '@teslapool/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { poolMemberships, pools, ratings, rideRequests } from '../../db/schema';
import { AppError, NotFoundError } from '../../lib/errors';

/**
 * The passenger rates the driver who dropped them off. Allowed once, and
 * only for a COMPLETED ride. COMPLETED is final, so there is no state to
 * lock; "once" is enforced by the primary key on ride_request_id, which
 * also settles two taps of the button arriving at the same instant.
 */
export async function rateRide(passengerId: string, rideId: string, input: RateRideInput) {
  const [ride] = await db
    .select({ status: rideRequests.status, driverId: pools.driverId })
    .from(rideRequests)
    // A completed ride keeps its (never-left) membership in the pool it finished in.
    .leftJoin(
      poolMemberships,
      and(eq(poolMemberships.rideRequestId, rideRequests.id), isNull(poolMemberships.leftAt)),
    )
    .leftJoin(pools, eq(pools.id, poolMemberships.poolId))
    .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)));
  if (!ride) throw new NotFoundError('Ride not found');
  if (ride.status !== 'COMPLETED' || !ride.driverId) {
    throw new AppError(
      409,
      'RATING_NOT_ALLOWED',
      'You can rate a ride once you have been dropped off',
    );
  }

  const [created] = await db
    .insert(ratings)
    .values({
      rideRequestId: rideId,
      passengerId,
      driverId: ride.driverId,
      stars: input.stars,
      comment: input.comment || null,
    })
    .onConflictDoNothing({ target: ratings.rideRequestId })
    .returning({ rideRequestId: ratings.rideRequestId });
  if (!created) throw new AppError(409, 'ALREADY_RATED', 'You have already rated this ride');
}

/** A driver's average stars (one decimal) and how many ratings it is based on. */
export async function driverRatingSummary(driverId: string): Promise<DriverRatingSummary | null> {
  const [row] = await db
    .select({
      average: sql<number>`round(avg(${ratings.stars}), 1)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(ratings)
    .where(eq(ratings.driverId, driverId));
  return row && row.count > 0 ? { average: row.average, count: row.count } : null;
}
