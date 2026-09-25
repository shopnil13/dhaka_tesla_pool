import { z } from 'zod';
import { PAYMENT_METHODS, type PaymentMethod, type PoolStatus, type RideStatus } from '../enums';
import { MAX_SEATS_PER_REQUEST, MAX_SHARED_SEATS, type FareBreakdown } from '../fare';
import type { PaymentView } from './wallet';

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
  /** Whether the passenger may cancel right now, and what it would cost. */
  cancellation: { allowed: boolean; feePoisha: number };
  payments: PaymentView[];
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

/** What a timeline line is about; the web app picks its marker from this. */
export const TIMELINE_KINDS = [
  'REQUESTED',
  'MATCHED',
  'REQUEUED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
  'OTHER',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

/**
 * One line of a ride's history, already worded by the API ("Jashim arrived
 * at Banani"). The stored event metadata never leaves the server, so nothing
 * about the other riders can leak through the timeline.
 */
export interface RideTimelineEntry {
  id: number;
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string | null;
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
