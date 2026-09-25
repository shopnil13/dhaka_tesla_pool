import type { RideRequestInput } from '@teslapool/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db, type Tx } from '../../db/client';
import { poolMemberships, rideRequests } from '../../db/schema';
import { passengerCancellation } from '../../domain/cancellation';
import { quoteFare } from '../../domain/fare';
import { checkCompatibility, type DistanceLookup } from '../../domain/matching';
import { assertRideTransition } from '../../domain/stateMachine';
import { isUniqueViolation } from '../../lib/dbErrors';
import { AppError, NotFoundError } from '../../lib/errors';
import { recordEvent } from '../../lib/events';
import {
  activeMembers,
  asJoinCandidate,
  findJoinCandidates,
  joinPool,
  leavePool,
  lockPool,
  lockRide,
  type RideRow,
} from '../pools/pools.repository';
import { chargeCancellationFee } from '../payments/payments.service';
import { assertTeslaPayCovers } from '../payments/wallet.service';
import { assertKnownZones, loadZoneMap } from '../zones/zones.service';
import { getPassengerRide } from './rides.queries';

/**
 * A passenger asks for a ride. In one transaction: price it, create the
 * request, and — if they are willing to share — try to seat them in a Tesla
 * that is already heading out from the same pickup. If none fits, the request
 * stays REQUESTED and appears in the feed of drivers in that zone.
 */
export async function requestRide(passengerId: string, input: RideRequestInput) {
  const zoneMap = await loadZoneMap();
  assertKnownZones(zoneMap, {
    pickupZoneId: input.pickupZoneId,
    dropoffZoneId: input.dropoffZoneId,
  });
  const distanceM = zoneMap.distance(input.pickupZoneId, input.dropoffZoneId);
  const quote = quoteFare({ distanceM, seats: input.seats, wantsShare: input.wantsShare });
  if (input.paymentMethod === 'TESLAPAY') {
    await assertTeslaPayCovers(passengerId, quote.totalPoisha);
  }

  const rideId = await db.transaction(async (tx) => {
    const ride = await insertRequest(tx, passengerId, input, distanceM, quote.totalPoisha);
    await recordEvent(tx, {
      rideRequestId: ride.id,
      from: null,
      to: 'REQUESTED',
      actorId: passengerId,
      actorRole: 'PASSENGER',
      metadata: { quote },
    });
    if (ride.wantsShare) await tryAutoMatch(tx, ride, zoneMap.distance);
    return ride.id;
  });

  return getPassengerRide(passengerId, rideId);
}

async function insertRequest(
  tx: Tx,
  passengerId: string,
  input: RideRequestInput,
  distanceM: number,
  quotedFarePoisha: number,
): Promise<RideRow> {
  try {
    const [ride] = await tx
      .insert(rideRequests)
      .values({
        passengerId,
        pickupZoneId: input.pickupZoneId,
        dropoffZoneId: input.dropoffZoneId,
        seats: input.seats,
        wantsShare: input.wantsShare,
        paymentMethod: input.paymentMethod,
        directDistanceM: distanceM,
        quotedFarePoisha,
      })
      .returning();
    return ride!;
  } catch (err) {
    // The partial unique index decides, so a double-tapped "Request" button
    // cannot create two rides even when both taps arrive at the same instant.
    if (isUniqueViolation(err, 'ride_requests_one_active_per_passenger')) {
      throw new AppError(409, 'ACTIVE_RIDE_EXISTS', 'You already have an active ride');
    }
    throw err;
  }
}

/**
 * Tries each candidate pool, oldest first. The candidate list is read without
 * locks and may be stale, so each pool is locked (FOR UPDATE) and the full
 * compatibility check is re-run against its current members before a seat is
 * claimed. If Shirin grabbed Bullet's last seat a millisecond earlier, the
 * re-check sees 3/3 and we move on (or leave the request waiting).
 */
async function tryAutoMatch(tx: Tx, ride: RideRow, distance: DistanceLookup) {
  const candidates = await findJoinCandidates(tx, ride.pickupZoneId, ride.seats);
  for (const candidate of candidates) {
    const pool = await lockPool(tx, candidate.id);
    const members = await activeMembers(tx, pool.id);
    const result = checkCompatibility(pool, members, asJoinCandidate(ride), distance);
    if (!result.ok) continue;

    await joinPool(tx, {
      pool,
      ride,
      route: result.route,
      actorId: null,
      actorRole: 'SYSTEM',
      reason: 'Auto-matched into a pool leaving from the same pickup',
    });
    return pool.id;
  }
  return null;
}

/** Thrown when the ride changed between the unlocked read and taking the locks. */
class RideChangedWhileLocking extends Error {}

/**
 * A passenger cancels. The pool (if any) is locked before the ride, following
 * the global lock order, so this is serialized with the driver pressing
 * Arrive or Start on the same pool. The cancellation policy is then applied
 * to the *locked* state: cancelling "just before" the driver arrives but
 * committing after is charged, and cancelling after the trip started is refused.
 */
export async function cancelRide(passengerId: string, rideId: string) {
  const zoneMap = await loadZoneMap();
  for (let attempt = 1; ; attempt++) {
    try {
      await db.transaction((tx) => cancelOnce(tx, passengerId, rideId, zoneMap.distance));
      return getPassengerRide(passengerId, rideId);
    } catch (err) {
      // The ride moved into (or out of) a pool between our first read and our
      // locks — e.g. a driver accepted it at that very moment. Locking the new
      // pool now would break the lock order, so start again from scratch.
      if (!(err instanceof RideChangedWhileLocking)) throw err;
      if (attempt === 3) {
        throw new AppError(
          409,
          'CONFLICT',
          'Your ride changed while cancelling. Please try again.',
        );
      }
    }
  }
}

async function cancelOnce(tx: Tx, passengerId: string, rideId: string, distance: DistanceLookup) {
  // 1. Unlocked read: which pool (if any) must be locked first?
  const seenPoolId = await currentPoolIdOf(tx, passengerId, rideId);

  // 2. Locks in the global order: pool → ride (→ wallet, inside the fee charge).
  const pool = seenPoolId ? await lockPool(tx, seenPoolId) : null;
  const ride = await lockRide(tx, rideId);
  if (ride.passengerId !== passengerId) throw new NotFoundError('Ride not found');
  if ((await currentPoolIdOf(tx, passengerId, rideId)) !== seenPoolId) {
    throw new RideChangedWhileLocking();
  }

  // 3. Decide on the locked state.
  const decision = passengerCancellation(ride.status, pool?.status ?? null);
  if (!decision.allowed) throw new AppError(409, 'CANCEL_NOT_ALLOWED', decision.reason);
  assertRideTransition(ride.status, 'CANCELLED');

  // 4. Apply: free the seat, cancel the ride, charge the fee if due.
  const left = pool ? await leavePool(tx, { pool, ride, distance }) : null;
  await tx
    .update(rideRequests)
    .set({
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: 'PASSENGER',
      cancellationFeePoisha: decision.feePoisha,
    })
    .where(eq(rideRequests.id, ride.id));
  const fee =
    decision.feePoisha > 0 ? await chargeCancellationFee(tx, ride, decision.feePoisha) : null;

  await recordEvent(tx, {
    rideRequestId: ride.id,
    from: ride.status,
    to: 'CANCELLED',
    actorId: passengerId,
    actorRole: 'PASSENGER',
    reason: fee ? 'Cancelled after the driver arrived' : 'Cancelled by the passenger',
    metadata: { poolId: pool?.id ?? null, fee, poolCancelled: left?.poolCancelled ?? false },
  });
}

/** The pool the ride is seated in right now (membership not left), or null. */
async function currentPoolIdOf(tx: Tx, passengerId: string, rideId: string) {
  const [row] = await tx
    .select({ exists: rideRequests.id, poolId: poolMemberships.poolId })
    .from(rideRequests)
    .leftJoin(
      poolMemberships,
      and(eq(poolMemberships.rideRequestId, rideRequests.id), isNull(poolMemberships.leftAt)),
    )
    .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)));
  if (!row) throw new NotFoundError('Ride not found');
  return row.poolId;
}
