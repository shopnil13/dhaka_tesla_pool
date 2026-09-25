import { describe, expect, it } from 'vitest';
import { passengerCancellation } from '../../src/domain/cancellation';

describe('passenger cancellation policy', () => {
  it('is free while Nusrat is still waiting for a Tesla', () => {
    expect(passengerCancellation('REQUESTED', null)).toEqual({ allowed: true, feePoisha: 0 });
  });

  it('is free while Bullet is on its way', () => {
    expect(passengerCancellation('MATCHED', 'ACCEPTED')).toEqual({ allowed: true, feePoisha: 0 });
  });

  it('costs ৳30 once Jashim has arrived at the pickup', () => {
    expect(passengerCancellation('MATCHED', 'DRIVER_ARRIVED')).toEqual({
      allowed: true,
      feePoisha: 3000,
    });
  });

  it('is not possible once the ride has started or ended', () => {
    expect(passengerCancellation('IN_PROGRESS', 'STARTED')).toEqual({
      allowed: false,
      reason: 'The ride has already started',
    });
    expect(passengerCancellation('COMPLETED', 'COMPLETED')).toMatchObject({ allowed: false });
    expect(passengerCancellation('CANCELLED', null)).toMatchObject({ allowed: false });
  });
});
