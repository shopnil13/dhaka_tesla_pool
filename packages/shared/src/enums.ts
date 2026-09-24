/**
 * Domain enums shared by the database schema (as Postgres enums), the API
 * and the web app, so a status can never be spelled two different ways.
 */

export const USER_ROLES = ['PASSENGER', 'DRIVER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** One passenger's trip. */
export const RIDE_STATUSES = [
  'REQUESTED',
  'MATCHED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

/** One vehicle trip that one or more ride requests share. */
export const POOL_STATUSES = [
  'ACCEPTED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type PoolStatus = (typeof POOL_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'TESLAPAY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PURPOSES = ['FARE', 'CANCELLATION_FEE'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/** DUE = owed but not yet collected (e.g. a late-cancel fee on a cash ride). */
export const PAYMENT_STATUSES = ['DUE', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const MEMBERSHIP_LEFT_REASONS = ['PASSENGER_CANCELLED', 'DRIVER_CANCELLED'] as const;
export type MembershipLeftReason = (typeof MEMBERSHIP_LEFT_REASONS)[number];

/** Who caused a state change; SYSTEM covers automatic transitions. */
export const ACTOR_ROLES = ['PASSENGER', 'DRIVER', 'SYSTEM'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const WALLET_TRANSACTION_TYPES = ['TOPUP', 'DEBIT'] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];
