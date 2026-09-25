import { LATE_CANCEL_FEE_POISHA, type PoolStatus, type RideStatus } from '@teslapool/shared';

export type CancellationDecision =
  { allowed: true; feePoisha: number } | { allowed: false; reason: string };

/**
 * When may a passenger cancel, and what does it cost?
 *   waiting for a Tesla (REQUESTED)        → free
 *   matched, Tesla on its way (ACCEPTED)   → free
 *   matched, driver at pickup (ARRIVED)    → ৳30 for the driver's wasted trip
 *   riding, finished or already cancelled  → not possible
 */
export function passengerCancellation(
  rideStatus: RideStatus,
  poolStatus: PoolStatus | null,
): CancellationDecision {
  if (rideStatus === 'REQUESTED') return { allowed: true, feePoisha: 0 };
  if (rideStatus === 'MATCHED' && poolStatus === 'ACCEPTED') return { allowed: true, feePoisha: 0 };
  if (rideStatus === 'MATCHED' && poolStatus === 'DRIVER_ARRIVED') {
    return { allowed: true, feePoisha: LATE_CANCEL_FEE_POISHA };
  }
  if (rideStatus === 'IN_PROGRESS')
    return { allowed: false, reason: 'The ride has already started' };
  if (rideStatus === 'COMPLETED' || rideStatus === 'CANCELLED') {
    return { allowed: false, reason: `The ride is already ${rideStatus.toLowerCase()}` };
  }
  return { allowed: false, reason: 'The ride cannot be cancelled right now' };
}
