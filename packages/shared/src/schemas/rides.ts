import { z } from 'zod';
import { MAX_SEATS_PER_REQUEST, MAX_SHARED_SEATS } from '../fare';

const zoneId = z.coerce.number().int().positive();

/** A trip as the passenger describes it; shared by the fare estimate and the ride request. */
export const tripSchema = z
  .object({
    pickupZoneId: zoneId,
    dropoffZoneId: zoneId,
    seats: z.coerce.number().int().min(1).max(MAX_SEATS_PER_REQUEST),
    wantsShare: z.boolean(),
  })
  .refine((trip) => trip.pickupZoneId !== trip.dropoffZoneId, {
    message: 'Pick a destination different from the pickup',
    path: ['dropoffZoneId'],
  })
  .refine((trip) => !trip.wantsShare || trip.seats <= MAX_SHARED_SEATS, {
    message: `A shared ride can book at most ${MAX_SHARED_SEATS} seats`,
    path: ['seats'],
  });
export type TripInput = z.infer<typeof tripSchema>;

export interface Zone {
  id: number;
  slug: string;
  name: string;
}
