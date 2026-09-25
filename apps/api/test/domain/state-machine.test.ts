import { POOL_STATUSES, RIDE_STATUSES } from '@teslapool/shared';
import { describe, expect, it } from 'vitest';
import {
  assertPoolTransition,
  assertRideTransition,
  canPoolTransition,
  canRideTransition,
  InvalidTransitionError,
} from '../../src/domain/stateMachine';

// Every pair that is allowed; anything else must be rejected.
const ALLOWED_POOL = new Set([
  'ACCEPTED→DRIVER_ARRIVED',
  'ACCEPTED→CANCELLED',
  'DRIVER_ARRIVED→STARTED',
  'DRIVER_ARRIVED→CANCELLED',
  'STARTED→COMPLETED',
]);
const ALLOWED_RIDE = new Set([
  'REQUESTED→MATCHED',
  'REQUESTED→CANCELLED',
  'MATCHED→IN_PROGRESS',
  'MATCHED→CANCELLED',
  'MATCHED→REQUESTED',
  'IN_PROGRESS→COMPLETED',
]);

describe('pool lifecycle', () => {
  it('allows exactly the documented transitions (all 25 pairs checked)', () => {
    for (const from of POOL_STATUSES)
      for (const to of POOL_STATUSES)
        expect(canPoolTransition(from, to), `${from}→${to}`).toBe(
          ALLOWED_POOL.has(`${from}→${to}`),
        );
  });

  it('rejects Jashim starting the trip before he has arrived, with a 409', () => {
    const attempt = () => assertPoolTransition('ACCEPTED', 'STARTED');

    expect(attempt).toThrow(InvalidTransitionError);
    expect(attempt).toThrow('A pool cannot go from ACCEPTED to STARTED');
    try {
      attempt();
    } catch (err) {
      expect(err).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
    }
  });

  it('cannot cancel a trip that is already on the road', () => {
    expect(() => assertPoolTransition('STARTED', 'CANCELLED')).toThrow(InvalidTransitionError);
  });
});

describe('ride lifecycle', () => {
  it('allows exactly the documented transitions (all 25 pairs checked)', () => {
    for (const from of RIDE_STATUSES)
      for (const to of RIDE_STATUSES)
        expect(canRideTransition(from, to), `${from}→${to}`).toBe(
          ALLOWED_RIDE.has(`${from}→${to}`),
        );
  });

  it('never reopens a finished ride', () => {
    for (const to of RIDE_STATUSES) {
      expect(() => assertRideTransition('COMPLETED', to)).toThrow(InvalidTransitionError);
      expect(() => assertRideTransition('CANCELLED', to)).toThrow(InvalidTransitionError);
    }
  });

  it("re-queues Nusrat's request if Jashim cancels the pool before pickup", () => {
    expect(() => assertRideTransition('MATCHED', 'REQUESTED')).not.toThrow();
  });
});
