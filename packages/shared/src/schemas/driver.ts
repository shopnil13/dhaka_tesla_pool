import { z } from 'zod';
import type { PaymentMethod, PoolStatus, RideStatus } from '../enums';
import type { Zone } from './rides';

export const driverStatusSchema = z.object({
  isOnline: z.boolean(),
  currentZoneId: z.coerce.number().int().positive(),
});
export type DriverStatusInput = z.infer<typeof driverStatusSchema>;

export interface DriverProfile {
  name: string;
  isOnline: boolean;
  zone: Zone | null;
  vehicle: { name: string; plate: string; capacity: number };
}

/** A waiting request in the driver's zone, and whether it fits the current pool. */
export interface DriverFeedItem {
  rideRequestId: string;
  passengerName: string;
  seats: number;
  wantsShare: boolean;
  dropoffZone: string;
  distanceM: number;
  quotedFarePoisha: number;
  requestedAt: string;
  canAccept: boolean;
  /** Why it cannot be accepted right now (null when it can). */
  reason: string | null;
}

export interface DriverPoolMember {
  rideRequestId: string;
  passengerName: string;
  seats: number;
  dropoffZone: string;
  dropoffOrder: number | null;
  status: RideStatus;
  paymentMethod: PaymentMethod;
  quotedFarePoisha: number;
  finalFarePoisha: number | null;
  /** Earlier unpaid cash fees, collected together with this fare. */
  duesPoisha: number;
}

/** The driver's current trip, with everyone aboard (drivers do see names and fares). */
export interface DriverPool {
  id: string;
  status: PoolStatus;
  isShared: boolean;
  pickupZone: string;
  capacity: number;
  seatsTaken: number;
  acceptedAt: string;
  arrivedAt: string | null;
  startedAt: string | null;
  members: DriverPoolMember[];
}
