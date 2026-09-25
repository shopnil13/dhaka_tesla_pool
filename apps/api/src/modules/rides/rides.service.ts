import type { RideRequestInput } from '@teslapool/shared';
import { db, type Tx } from '../../db/client';
import { rideRequests } from '../../db/schema';
import { quoteFare } from '../../domain/fare';
import { checkCompatibility, type DistanceLookup } from '../../domain/matching';
import { isUniqueViolation } from '../../lib/dbErrors';
import { AppError } from '../../lib/errors';
import { recordEvent } from '../../lib/events';
import {
  activeMembers,
  asJoinCandidate,
  findJoinCandidates,
  joinPool,
  lockPool,
  type RideRow,
} from '../pools/pools.repository';
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
