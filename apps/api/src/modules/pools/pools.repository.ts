import type { ActorRole } from '@teslapool/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { poolMemberships, pools, rideRequests } from '../../db/schema';
import type { JoinCandidate, PlannedRoute, PoolRider } from '../../domain/matching';
import { assertRideTransition } from '../../domain/stateMachine';
import { NotFoundError } from '../../lib/errors';
import { recordEvent } from '../../lib/events';

export type PoolRow = typeof pools.$inferSelect;
export type RideRow = typeof rideRequests.$inferSelect;

export const asJoinCandidate = (ride: RideRow): JoinCandidate => ({
  rideRequestId: ride.id,
  pickupZoneId: ride.pickupZoneId,
  dropoffZoneId: ride.dropoffZoneId,
  seats: ride.seats,
  wantsShare: ride.wantsShare,
});

/**
 * Shared pools at this pickup that looked joinable a moment ago, oldest first.
 * NOT locked: the result may be stale by the time we act on it, which is why
 * every candidate is locked and re-checked before a seat is claimed.
 */
export function findJoinCandidates(tx: Tx, pickupZoneId: number, seats: number) {
  return tx
    .select({ id: pools.id })
    .from(pools)
    .where(
      and(
        eq(pools.status, 'ACCEPTED'),
        eq(pools.isShared, true),
        eq(pools.pickupZoneId, pickupZoneId),
        sql`${pools.capacity} - ${pools.seatsTaken} >= ${seats}`,
      ),
    )
    .orderBy(asc(pools.acceptedAt));
}

/**
 * SELECT … FOR UPDATE: waits until no other transaction holds this pool, then
 * returns its latest committed state. Everything that decides who gets a seat
 * happens while this lock is held, so two passengers racing for Bullet's last
 * seat are served one after the other, never at the same time.
 *
 * Lock order everywhere: pools → ride_requests → wallet_accounts (no deadlocks).
 */
export async function lockPool(tx: Tx, poolId: string): Promise<PoolRow> {
  const [pool] = await tx.select().from(pools).where(eq(pools.id, poolId)).for('update');
  if (!pool) throw new NotFoundError('Pool not found');
  return pool;
}

/** Current members in join order (the order the route planner breaks ties by). */
export function activeMembers(tx: Tx, poolId: string): Promise<PoolRider[]> {
  return tx
    .select({
      rideRequestId: poolMemberships.rideRequestId,
      seats: poolMemberships.seats,
      dropoffZoneId: rideRequests.dropoffZoneId,
    })
    .from(poolMemberships)
    .innerJoin(rideRequests, eq(rideRequests.id, poolMemberships.rideRequestId))
    .where(and(eq(poolMemberships.poolId, poolId), isNull(poolMemberships.leftAt)))
    .orderBy(asc(poolMemberships.joinedAt), asc(poolMemberships.id));
}

interface JoinPoolInput {
  pool: PoolRow;
  ride: RideRow;
  route: PlannedRoute;
  actorId: string | null;
  actorRole: ActorRole;
  reason: string;
}

/**
 * Seats a REQUESTED ride in a pool. Caller must hold the pool lock and have
 * checked compatibility against the members read under that lock.
 */
export async function joinPool(tx: Tx, input: JoinPoolInput) {
  const { pool, ride, route } = input;
  assertRideTransition(ride.status, 'MATCHED');

  await tx.insert(poolMemberships).values({
    poolId: pool.id,
    rideRequestId: ride.id,
    seats: ride.seats,
    joinedAt: new Date(),
  });
  // An increment rather than a computed value; the CHECK (seats_taken <= capacity)
  // aborts the transaction if this ever overbooks, whatever the code above did.
  const [updated] = await tx
    .update(pools)
    .set({ seatsTaken: sql`${pools.seatsTaken} + ${ride.seats}` })
    .where(eq(pools.id, pool.id))
    .returning({ seatsTaken: pools.seatsTaken });
  await tx
    .update(rideRequests)
    .set({ status: 'MATCHED', matchedAt: new Date() })
    .where(eq(rideRequests.id, ride.id));
  await saveDropoffOrder(tx, pool.id, route);

  await recordEvent(tx, {
    rideRequestId: ride.id,
    from: ride.status,
    to: 'MATCHED',
    actorId: input.actorId,
    actorRole: input.actorRole,
    reason: input.reason,
    metadata: { poolId: pool.id, seatsTaken: updated!.seatsTaken, capacity: pool.capacity },
  });
}

/** Stores each member's stop number from the planned route (1 = first drop-off). */
async function saveDropoffOrder(tx: Tx, poolId: string, route: PlannedRoute) {
  for (const [index, stop] of route.stops.entries()) {
    await tx
      .update(poolMemberships)
      .set({ dropoffOrder: index + 1 })
      .where(
        and(
          eq(poolMemberships.poolId, poolId),
          inArray(poolMemberships.rideRequestId, stop.rideRequestIds),
          isNull(poolMemberships.leftAt),
        ),
      );
  }
}
