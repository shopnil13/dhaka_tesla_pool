import { MAX_DETOUR_M, type PoolStatus } from '@teslapool/shared';

/**
 * The pooling rule: a request may join a pool when
 *   1. the pool is still taking passengers (ACCEPTED, i.e. the driver has not arrived),
 *   2. both the pool and the request are willing to share,
 *   3. they have the same pickup zone,
 *   4. enough seats are free, and
 *   5. on the nearest-first drop-off route, no rider (old or new) travels more
 *      than MAX_DETOUR_M further than their direct trip.
 * Pure functions: the service re-runs this under a row lock with fresh data.
 */

/** Road distance in metres between two zones; 0 for the same zone. */
export type DistanceLookup = (fromZoneId: number, toZoneId: number) => number;

export function createDistanceLookup(
  rows: ReadonlyArray<{ fromZoneId: number; toZoneId: number; distanceM: number }>,
): DistanceLookup {
  const table = new Map(rows.map((row) => [`${row.fromZoneId}:${row.toZoneId}`, row.distanceM]));
  return (from, to) => {
    if (from === to) return 0;
    const distanceM = table.get(`${from}:${to}`);
    if (distanceM === undefined) throw new Error(`No distance between zones ${from} and ${to}`);
    return distanceM;
  };
}

export interface PoolRider {
  rideRequestId: string;
  dropoffZoneId: number;
  seats: number;
}

export interface RouteStop {
  zoneId: number;
  rideRequestIds: string[];
  /** Distance driven from the pickup when this stop is reached. */
  atM: number;
}

export interface PlannedRoute {
  stops: RouteStop[];
  totalM: number;
  /** Extra metres each rider travels compared with riding alone. */
  detourM: Map<string, number>;
}

/**
 * Drop-off order from the shared pickup: always drive to the nearest remaining
 * destination. Riders must be passed in join order; ties go to the earlier joiner.
 */
export function planRoute(
  pickupZoneId: number,
  ridersInJoinOrder: readonly PoolRider[],
  distance: DistanceLookup,
): PlannedRoute {
  const remaining = [...ridersInJoinOrder];
  const stops: RouteStop[] = [];
  const detourM = new Map<string, number>();
  let here = pickupZoneId;
  let travelledM = 0;

  while (remaining.length > 0) {
    let nextIndex = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (
        distance(here, remaining[i]!.dropoffZoneId) <
        distance(here, remaining[nextIndex]!.dropoffZoneId)
      ) {
        nextIndex = i;
      }
    }
    const [rider] = remaining.splice(nextIndex, 1);
    travelledM += distance(here, rider!.dropoffZoneId);
    here = rider!.dropoffZoneId;

    const lastStop = stops.at(-1);
    if (lastStop?.zoneId === here) lastStop.rideRequestIds.push(rider!.rideRequestId);
    else stops.push({ zoneId: here, rideRequestIds: [rider!.rideRequestId], atM: travelledM });
    detourM.set(rider!.rideRequestId, travelledM - distance(pickupZoneId, here));
  }

  return { stops, totalM: travelledM, detourM };
}

export interface JoinablePool {
  status: PoolStatus;
  isShared: boolean;
  pickupZoneId: number;
  capacity: number;
  seatsTaken: number;
}

export interface JoinCandidate extends PoolRider {
  pickupZoneId: number;
  wantsShare: boolean;
}

export type MatchRejection =
  'POOL_NOT_JOINABLE' | 'NOT_SHARED' | 'DIFFERENT_PICKUP' | 'NOT_ENOUGH_SEATS' | 'DETOUR_TOO_LONG';

export type MatchResult =
  { ok: true; route: PlannedRoute } | { ok: false; reason: MatchRejection; message: string };

const reject = (reason: MatchRejection, message: string): MatchResult => ({
  ok: false,
  reason,
  message,
});

const km = (metres: number) => `${metres / 1000} km`;

export function checkCompatibility(
  pool: JoinablePool,
  membersInJoinOrder: readonly PoolRider[],
  candidate: JoinCandidate,
  distance: DistanceLookup,
): MatchResult {
  if (pool.status !== 'ACCEPTED') {
    return reject('POOL_NOT_JOINABLE', 'This Tesla is no longer taking passengers');
  }
  if (!pool.isShared || !candidate.wantsShare) {
    return reject('NOT_SHARED', 'Solo rides are never shared');
  }
  if (pool.pickupZoneId !== candidate.pickupZoneId) {
    return reject('DIFFERENT_PICKUP', 'Pickup is in a different zone');
  }
  const freeSeats = pool.capacity - pool.seatsTaken;
  if (candidate.seats > freeSeats) {
    return reject('NOT_ENOUGH_SEATS', `Only ${freeSeats} of ${pool.capacity} seats left`);
  }

  const route = planRoute(pool.pickupZoneId, [...membersInJoinOrder, candidate], distance);
  const worstDetourM = Math.max(...route.detourM.values());
  if (worstDetourM > MAX_DETOUR_M) {
    return reject(
      'DETOUR_TOO_LONG',
      `Sharing would add ${km(worstDetourM)} to someone's trip (limit ${km(MAX_DETOUR_M)})`,
    );
  }
  return { ok: true, route };
}
