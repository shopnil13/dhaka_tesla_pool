import type { PassengerRide } from '@teslapool/shared';

export type RideStage = 'waiting' | 'matched' | 'arrived' | 'riding' | 'completed' | 'cancelled';

/** One passenger-facing stage, combining the ride's and the pool's status. */
export function rideStage(ride: PassengerRide): RideStage {
  switch (ride.status) {
    case 'REQUESTED':
      return 'waiting';
    case 'MATCHED':
      return ride.pool?.status === 'DRIVER_ARRIVED' ? 'arrived' : 'matched';
    case 'IN_PROGRESS':
      return 'riding';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
  }
}

export const STAGE_STEPS: { stage: RideStage; label: string }[] = [
  { stage: 'waiting', label: 'Requested' },
  { stage: 'matched', label: 'Matched' },
  { stage: 'arrived', label: 'Driver arrived' },
  { stage: 'riding', label: 'On the way' },
  { stage: 'completed', label: 'Completed' },
];

export function stageHeadline(ride: PassengerRide): string {
  const vehicle = ride.pool?.vehicle.name ?? 'your Tesla';
  switch (rideStage(ride)) {
    case 'waiting':
      return `Looking for a Tesla leaving ${ride.pickupZone.name}…`;
    case 'matched':
      return `${vehicle} is on the way to ${ride.pickupZone.name}`;
    case 'arrived':
      return `${ride.pool?.driverName ?? 'Your driver'} has arrived at ${ride.pickupZone.name}`;
    case 'riding':
      return `On the way to ${ride.dropoffZone.name}`;
    case 'completed':
      return `You arrived at ${ride.dropoffZone.name}`;
    case 'cancelled':
      return 'This ride was cancelled';
  }
}
