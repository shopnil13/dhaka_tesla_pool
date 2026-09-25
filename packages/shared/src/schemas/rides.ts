import { z } from 'zod';
import { PAYMENT_METHODS, type PaymentMethod, type PoolStatus, type RideStatus } from '../enums';
import { MAX_SEATS_PER_REQUEST, MAX_SHARED_SEATS, type FareBreakdown } from '../fare';

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

export const rideRequestSchema = tripSchema.and(
  z.object({ paymentMethod: z.enum(PAYMENT_METHODS) }),
);
export type RideRequestInput = z.infer<typeof rideRequestSchema>;

export interface Zone {
  id: number;
  slug: string;
  name: string;
}

/**
 * A ride as its passenger sees it: their own status and fare, the driver and
 * vehicle, but only a count of co-riders — never their names or fares.
 */
export interface PassengerRide {
  id: string;
  status: RideStatus;
  pickupZone: Zone;
  dropoffZone: Zone;
  seats: number;
  wantsShare: boolean;
  paymentMethod: PaymentMethod;
  distanceM: number;
  quotedFarePoisha: number;
  finalFarePoisha: number | null;
  fareBreakdown: FareBreakdown | null;
  cancellationFeePoisha: number;
  requestedAt: string;
  matchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  pool: {
    id: string;
    status: PoolStatus;
    driverName: string;
    vehicle: { name: string; plate: string; capacity: number };
    seatsTaken: number;
    /** Other bookings sharing the Tesla. */
    coRiders: number;
    /** Your position in the drop-off order (1 = first). */
    dropoffOrder: number | null;
  } | null;
}

/** One line in the passenger's ride history. */
export interface RideSummary {
  id: string;
  status: RideStatus;
  pickupZone: string;
  dropoffZone: string;
  seats: number;
  wantsShare: boolean;
  /** Final fare once known, otherwise the quote. */
  farePoisha: number;
  requestedAt: string;
}
