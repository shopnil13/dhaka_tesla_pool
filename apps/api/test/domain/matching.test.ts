import { describe, expect, it } from 'vitest';
import {
  checkCompatibility,
  createDistanceLookup,
  planRoute,
  type JoinablePool,
} from '../../src/domain/matching';
import { seedDistances, zoneIdOf } from '../support/zones';

const banani = zoneIdOf('banani');

// Everyone is picked up on Banani Road 11.
const nusrat = { rideRequestId: 'nusrat', dropoffZoneId: zoneIdOf('mohakhali'), seats: 1 };
const rafiq = { rideRequestId: 'rafiq', dropoffZoneId: zoneIdOf('gulshan-1'), seats: 1 };
const shirin = { rideRequestId: 'shirin', dropoffZoneId: zoneIdOf('mohakhali'), seats: 1 };
const asShared = <T extends object>(rider: T) => ({
  ...rider,
  pickupZoneId: banani,
  wantsShare: true,
});

const bulletWithNusrat: JoinablePool = {
  status: 'ACCEPTED',
  isShared: true,
  pickupZoneId: banani,
  capacity: 3,
  seatsTaken: 1,
};

describe('planRoute', () => {
  it('drops Nusrat at Mohakhali (2.5 km) before Rafiq at Gulshan 1 (4.5 km)', () => {
    const route = planRoute(banani, [nusrat, rafiq], seedDistances);

    expect(route.stops).toEqual([
      { zoneId: zoneIdOf('mohakhali'), rideRequestIds: ['nusrat'], atM: 2500 },
      { zoneId: zoneIdOf('gulshan-1'), rideRequestIds: ['rafiq'], atM: 4500 },
    ]);
    // Rafiq alone would ride 3.0 km, so sharing costs him 1.5 km; Nusrat loses nothing.
    expect(route.detourM).toEqual(
      new Map([
        ['nusrat', 0],
        ['rafiq', 1500],
      ]),
    );
  });

  it('lets riders going to the same zone share one stop', () => {
    const route = planRoute(banani, [nusrat, rafiq, shirin], seedDistances);

    expect(route.stops.map((s) => s.rideRequestIds)).toEqual([['nusrat', 'shirin'], ['rafiq']]);
  });

  it('breaks ties in favour of whoever joined first', () => {
    // A tiny made-up map where both destinations are exactly 1 km away.
    const lookup = createDistanceLookup([
      { fromZoneId: 1, toZoneId: 2, distanceM: 1000 },
      { fromZoneId: 2, toZoneId: 1, distanceM: 1000 },
      { fromZoneId: 1, toZoneId: 3, distanceM: 1000 },
      { fromZoneId: 3, toZoneId: 1, distanceM: 1000 },
      { fromZoneId: 2, toZoneId: 3, distanceM: 500 },
      { fromZoneId: 3, toZoneId: 2, distanceM: 500 },
    ]);
    const first = { rideRequestId: 'first', dropoffZoneId: 3, seats: 1 };
    const second = { rideRequestId: 'second', dropoffZoneId: 2, seats: 1 };

    expect(planRoute(1, [first, second], lookup).stops[0]?.rideRequestIds).toEqual(['first']);
  });
});

describe('checkCompatibility', () => {
  it('lets Rafiq join Nusrat: overlapping but not identical trips (1.5 km detour ≤ 2 km)', () => {
    const result = checkCompatibility(bulletWithNusrat, [nusrat], asShared(rafiq), seedDistances);

    expect(result.ok).toBe(true);
  });

  it('lets Shirin take the last seat on the same route', () => {
    const pool = { ...bulletWithNusrat, seatsTaken: 2 };

    expect(checkCompatibility(pool, [nusrat, rafiq], asShared(shirin), seedDistances).ok).toBe(
      true,
    );
  });

  it('accepts a far destination that is on the way: Dhanmondi via Mohakhali adds 0 km', () => {
    const tania = asShared({
      rideRequestId: 'tania',
      dropoffZoneId: zoneIdOf('dhanmondi'),
      seats: 1,
    });
    const result = checkCompatibility(bulletWithNusrat, [nusrat], tania, seedDistances);

    expect(result.ok && result.route.detourM.get('tania')).toBe(0);
  });

  it('rejects a close destination in the wrong direction: Gulshan 2 would add 2.5 km to Nusrat', () => {
    const tania = asShared({
      rideRequestId: 'tania',
      dropoffZoneId: zoneIdOf('gulshan-2'),
      seats: 1,
    });

    expect(checkCompatibility(bulletWithNusrat, [nusrat], tania, seedDistances)).toMatchObject({
      ok: false,
      reason: 'DETOUR_TOO_LONG',
      message: "Sharing would add 2.5 km to someone's trip (limit 2 km)",
    });
  });

  it('rejects a booking that needs more seats than are free', () => {
    const pool = { ...bulletWithNusrat, seatsTaken: 2 };

    expect(
      checkCompatibility(pool, [nusrat, rafiq], asShared({ ...shirin, seats: 2 }), seedDistances),
    ).toMatchObject({ ok: false, reason: 'NOT_ENOUGH_SEATS', message: 'Only 1 of 3 seats left' });
  });

  it('never mixes solo and shared rides', () => {
    const soloPool = { ...bulletWithNusrat, isShared: false };
    const soloRafiq = { ...asShared(rafiq), wantsShare: false };

    expect(checkCompatibility(soloPool, [nusrat], asShared(rafiq), seedDistances)).toMatchObject({
      reason: 'NOT_SHARED',
    });
    expect(checkCompatibility(bulletWithNusrat, [nusrat], soloRafiq, seedDistances)).toMatchObject({
      reason: 'NOT_SHARED',
    });
  });

  it('rejects a different pickup zone', () => {
    const fromGulshan = { ...asShared(rafiq), pickupZoneId: zoneIdOf('gulshan-2') };

    expect(
      checkCompatibility(bulletWithNusrat, [nusrat], fromGulshan, seedDistances),
    ).toMatchObject({
      reason: 'DIFFERENT_PICKUP',
    });
  });

  it('stops taking passengers once Jashim has arrived at the pickup', () => {
    const arrived = { ...bulletWithNusrat, status: 'DRIVER_ARRIVED' as const };

    expect(checkCompatibility(arrived, [nusrat], asShared(rafiq), seedDistances)).toMatchObject({
      reason: 'POOL_NOT_JOINABLE',
    });
  });
});
