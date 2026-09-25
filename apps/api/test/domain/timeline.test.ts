import { describe, expect, it } from 'vitest';
import { describeRideEvent, type StoredEvent } from '../../src/domain/timeline';

const rafiqsRide = {
  pickupZone: 'Banani',
  dropoffZone: 'Gulshan 1',
  paymentMethod: 'CASH',
} as const;

const event = (overrides: Partial<StoredEvent>): StoredEvent => ({
  subject: 'RIDE',
  from: null,
  to: 'REQUESTED',
  actorRole: 'PASSENGER',
  actorName: 'Rafiq',
  reason: null,
  metadata: null,
  ...overrides,
});

describe('timeline wording', () => {
  it('adds an old cash fee to the fare Rafiq paid at drop-off', () => {
    const line = describeRideEvent(
      event({
        from: 'IN_PROGRESS',
        to: 'COMPLETED',
        actorRole: 'DRIVER',
        actorName: 'Jashim',
        metadata: { farePoisha: 8_000, duesPoisha: 3_000, method: 'CASH' },
      }),
      rafiqsRide,
    );
    expect(line).toEqual({
      kind: 'COMPLETED',
      title: 'Dropped off at Gulshan 1',
      detail: 'Paid ৳110 in cash: ৳80 fare + ৳30 owed from an earlier ride',
    });
  });

  it('tells a cash rider that a late fee is collected with the next ride', () => {
    const line = describeRideEvent(
      event({
        from: 'MATCHED',
        to: 'CANCELLED',
        metadata: { fee: { feePoisha: 3_000, status: 'DUE' } },
      }),
      rafiqsRide,
    );
    expect(line.detail).toBe('Late fee ৳30, collected with your next ride');
  });

  it('calls a free cancellation free', () => {
    const line = describeRideEvent(
      event({ from: 'REQUESTED', to: 'CANCELLED', metadata: { fee: null } }),
      rafiqsRide,
    );
    expect(line).toMatchObject({ title: 'You cancelled', detail: 'No charge' });
  });

  it('still reads sensibly when metadata is missing', () => {
    const line = describeRideEvent(event({ to: 'IN_PROGRESS', from: 'MATCHED' }), rafiqsRide);
    expect(line).toEqual({ kind: 'STARTED', title: 'Trip started', detail: null });
  });

  it('never uses the actor name of a non-driver as "the driver"', () => {
    const line = describeRideEvent(
      event({ subject: 'POOL', to: 'DRIVER_ARRIVED', actorRole: 'SYSTEM', actorName: null }),
      rafiqsRide,
    );
    expect(line.title).toBe('Your driver arrived at Banani');
  });

  it('falls back to a generic line for an event it does not know', () => {
    const line = describeRideEvent(event({ to: 'TELEPORTED', reason: 'Beam me up' }), rafiqsRide);
    expect(line).toEqual({
      kind: 'OTHER',
      title: 'Status changed to teleported',
      detail: 'Beam me up',
    });
  });
});
