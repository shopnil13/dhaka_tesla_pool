/**
 * Pricing and matching constants. Money is always integer poisha
 * (৳1 = 100 poisha): integer arithmetic is exact, floats are not.
 */

/** ৳40 flag fall per seat. */
export const BASE_FARE_POISHA = 4_000;
/** ৳20 per km of the passenger's own direct distance. */
export const PER_KM_POISHA = 2_000;
/** Share discount quoted up front: the rate for the smallest pool (2 riders). */
export const SHARE_DISCOUNT_PCT = 20;
/** Share discount when the pool starts with 3 or more riders. */
export const FULL_POOL_DISCOUNT_PCT = 30;
export const FULL_POOL_RIDERS = 3;
/** Charged when a passenger cancels after the driver has arrived. */
export const LATE_CANCEL_FEE_POISHA = 3_000;
/** A new rider may join a pool only if no rider's trip grows by more than this. */
export const MAX_DETOUR_M = 2_000;
/** Every Tesla in this MVP seats three (Jashim's Bullet). */
export const MAX_SEATS_PER_REQUEST = 3;
/** Sharing a full car makes no sense, so a shared booking leaves at least one seat. */
export const MAX_SHARED_SEATS = 2;

/** 7200 → "৳72", 7250 → "৳72.50". */
export function formatTaka(poisha: number): string {
  const taka = poisha / 100;
  return `৳${Number.isInteger(taka) ? taka : taka.toFixed(2)}`;
}

/** How a fare was computed. Stored as a snapshot so history never changes. */
export interface FareBreakdown {
  distanceM: number;
  seats: number;
  baseFarePoisha: number;
  distanceChargePoisha: number;
  subtotalPoisha: number;
  shared: boolean;
  /** Bookings in the pool the discount is based on (null for solo rides). */
  riders: number | null;
  discountPct: number;
  discountPoisha: number;
  totalPoisha: number;
}
