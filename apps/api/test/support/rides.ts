import type { ZoneSlug } from '../../src/db/seed-data/zones';
import { zoneIdOf } from './zones';

/** A ride request body from Banani Road 11, where the whole story starts. */
export const fromBanani = (to: ZoneSlug, extra: object = {}) => ({
  pickupZoneId: zoneIdOf('banani'),
  dropoffZoneId: zoneIdOf(to),
  seats: 1,
  wantsShare: true,
  paymentMethod: 'CASH',
  ...extra,
});
