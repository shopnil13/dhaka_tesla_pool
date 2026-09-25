import type { PoolStatus, RideStatus } from '@teslapool/shared';
import { AppError } from '../lib/errors';

/**
 * Two lifecycles, because a pool and a passenger do not finish together:
 * Nusrat is dropped off (and pays) while Rafiq is still riding.
 *
 * Pool (the vehicle trip)
 *   ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED
 *   ACCEPTED | DRIVER_ARRIVED → CANCELLED
 *
 * Ride request (one passenger)
 *   REQUESTED → MATCHED → IN_PROGRESS → COMPLETED
 *   REQUESTED | MATCHED → CANCELLED
 *   MATCHED → REQUESTED (the driver cancelled the pool; the request is re-queued)
 *
 * Only what is listed is allowed. Who may trigger a transition (passenger,
 * driver, system) is decided by the services, not here.
 */
const POOL_TRANSITIONS: Record<PoolStatus, readonly PoolStatus[]> = {
  ACCEPTED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

const RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['IN_PROGRESS', 'CANCELLED', 'REQUESTED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

type Entity = 'pool' | 'ride';

export class InvalidTransitionError extends AppError {
  constructor(entity: Entity, from: string, to: string) {
    super(409, 'INVALID_TRANSITION', `A ${entity} cannot go from ${from} to ${to}`, {
      entity,
      from,
      to,
    });
  }
}

export const canPoolTransition = (from: PoolStatus, to: PoolStatus) =>
  POOL_TRANSITIONS[from].includes(to);

export const canRideTransition = (from: RideStatus, to: RideStatus) =>
  RIDE_TRANSITIONS[from].includes(to);

export function assertPoolTransition(from: PoolStatus, to: PoolStatus) {
  if (!canPoolTransition(from, to)) throw new InvalidTransitionError('pool', from, to);
}

export function assertRideTransition(from: RideStatus, to: RideStatus) {
  if (!canRideTransition(from, to)) throw new InvalidTransitionError('ride', from, to);
}
