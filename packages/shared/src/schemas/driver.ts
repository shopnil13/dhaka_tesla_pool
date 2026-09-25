import { z } from 'zod';
import type { MembershipLeftReason, PaymentMethod, PoolStatus, RideStatus } from '../enums';
import type { DriverRatingSummary, Zone } from './rides';

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

/** One booking in a finished pool, and how it ended for the driver. */
export interface DriverHistoryRider {
  rideRequestId: string;
  passengerName: string;
  seats: number;
  dropoffZone: string;
  /** Dropped off, cancelled by the passenger, or taken off when the driver cancelled. */
  outcome: 'DROPPED_OFF' | MembershipLeftReason;
  paymentMethod: PaymentMethod;
  /** The fare for a drop-off, the late fee for a late cancel, otherwise 0. */
  amountPoisha: number;
  rating: { stars: number; comment: string | null } | null;
}

export interface DriverPastPool {
  id: string;
  status: PoolStatus;
  isShared: boolean;
  pickupZone: string;
  acceptedAt: string;
  endedAt: string;
  riders: DriverHistoryRider[];
  /** Fares plus late fees from this trip. */
  earningsPoisha: number;
}

/** The driver's finished pools, newest first, with lifetime totals. */
export interface DriverHistory {
  summary: {
    completedTrips: number;
    ridersCarried: number;
    earningsPoisha: number;
    rating: DriverRatingSummary | null;
  };
  pools: DriverPastPool[];
}
