import {
  BASE_FARE_POISHA,
  FULL_POOL_DISCOUNT_PCT,
  FULL_POOL_RIDERS,
  PER_KM_POISHA,
  SHARE_DISCOUNT_PCT,
  type FareBreakdown,
} from '@teslapool/shared';

/**
 * The fare model, in one line per step (all integer poisha):
 *
 *   subtotal = (BASE + distanceKm × PER_KM) × seats
 *   discount = floor(subtotal × pct / 100)      pct = 0 solo, 20 shared, 30 if 3+ riders
 *   total    = subtotal − discount
 *
 * A shared ride is quoted up front at the 20% rate. When the pool starts it
 * is re-priced for the riders actually on board, and the price can only
 * drop: final = min(quote, re-priced). The database enforces final ≤ quote too.
 */

interface Trip {
  distanceM: number;
  seats: number;
  wantsShare: boolean;
}

function assertValidTrip({ distanceM, seats }: Trip) {
  if (!Number.isInteger(distanceM) || distanceM <= 0) {
    throw new RangeError(`distanceM must be a positive integer, got ${distanceM}`);
  }
  if (!Number.isInteger(seats) || seats < 1) {
    throw new RangeError(`seats must be a positive integer, got ${seats}`);
  }
}

/** The share discount for a pool with this many bookings in it. */
export const shareDiscountPct = (riders: number) =>
  riders >= FULL_POOL_RIDERS ? FULL_POOL_DISCOUNT_PCT : SHARE_DISCOUNT_PCT;

function price(trip: Trip, riders: number | null): FareBreakdown {
  assertValidTrip(trip);
  const distanceChargePoisha = Math.round((trip.distanceM * PER_KM_POISHA) / 1000);
  const subtotalPoisha = (BASE_FARE_POISHA + distanceChargePoisha) * trip.seats;
  const discountPct = trip.wantsShare ? shareDiscountPct(riders ?? 2) : 0;
  const discountPoisha = Math.floor((subtotalPoisha * discountPct) / 100);
  return {
    distanceM: trip.distanceM,
    seats: trip.seats,
    baseFarePoisha: BASE_FARE_POISHA,
    distanceChargePoisha,
    subtotalPoisha,
    shared: trip.wantsShare,
    riders: trip.wantsShare ? riders : null,
    discountPct,
    discountPoisha,
    totalPoisha: subtotalPoisha - discountPoisha,
  };
}

/**
 * What the passenger is shown and agrees to before requesting. A shared quote
 * assumes the smallest pool (2 riders) and is honoured even if nobody joins.
 */
export const quoteFare = (trip: Trip) => price(trip, trip.wantsShare ? 2 : null);

/** The best case, shown as "could drop to ..." when sharing. */
export const fullPoolFare = (trip: Trip) => price(trip, FULL_POOL_RIDERS);

/** The fare frozen when the pool starts, never above the quote. */
export function finalFare(trip: Trip, ridersAtStart: number, quotedPoisha: number): FareBreakdown {
  const repriced = price(trip, trip.wantsShare ? ridersAtStart : null);
  if (repriced.totalPoisha <= quotedPoisha) return repriced;
  // Unreachable with the current rules (more riders only ever means a bigger
  // discount), but the promise is kept explicitly rather than by coincidence.
  return {
    ...repriced,
    discountPoisha: repriced.subtotalPoisha - quotedPoisha,
    totalPoisha: quotedPoisha,
  };
}
