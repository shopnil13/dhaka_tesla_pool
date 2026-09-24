import {
  ACTOR_ROLES,
  MEMBERSHIP_LEFT_REASONS,
  PAYMENT_METHODS,
  POOL_STATUSES,
  RIDE_STATUSES,
} from '@teslapool/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamptz } from './columns';
import { users, vehicles } from './users';
import { zones } from './zones';

export const rideStatus = pgEnum('ride_status', RIDE_STATUSES);
export const poolStatus = pgEnum('pool_status', POOL_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);
export const membershipLeftReason = pgEnum('membership_left_reason', MEMBERSHIP_LEFT_REASONS);
export const actorRole = pgEnum('actor_role', ACTOR_ROLES);

/**
 * One passenger's trip, from request to drop-off. It carries the passenger's
 * own fare; which pool it rides in is recorded in pool_memberships.
 */
export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id),
    pickupZoneId: smallint('pickup_zone_id')
      .notNull()
      .references(() => zones.id),
    dropoffZoneId: smallint('dropoff_zone_id')
      .notNull()
      .references(() => zones.id),
    seats: smallint('seats').notNull(),
    wantsShare: boolean('wants_share').notNull(),
    paymentMethod: paymentMethod('payment_method').notNull(),
    status: rideStatus('status').notNull().default('REQUESTED'),
    directDistanceM: integer('direct_distance_m').notNull(),
    quotedFarePoisha: integer('quoted_fare_poisha').notNull(),
    finalFarePoisha: integer('final_fare_poisha'),
    // Snapshot of how the final fare was computed, frozen when the pool starts.
    fareBreakdown: jsonb('fare_breakdown'),
    cancellationFeePoisha: integer('cancellation_fee_poisha').notNull().default(0),
    cancelledBy: actorRole('cancelled_by'),
    cancelReason: text('cancel_reason'),
    requestedAt: timestamptz('requested_at').notNull().defaultNow(),
    matchedAt: timestamptz('matched_at'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    cancelledAt: timestamptz('cancelled_at'),
  },
  (t) => [
    check('ride_requests_seats_range', sql`${t.seats} BETWEEN 1 AND 6`),
    check('ride_requests_distinct_zones', sql`${t.pickupZoneId} <> ${t.dropoffZoneId}`),
    check('ride_requests_distance_positive', sql`${t.directDistanceM} > 0`),
    check('ride_requests_quote_positive', sql`${t.quotedFarePoisha} > 0`),
    // Upfront pricing promise: the final fare can only be equal to or lower than the quote.
    check(
      'ride_requests_final_within_quote',
      sql`${t.finalFarePoisha} IS NULL OR ${t.finalFarePoisha} BETWEEN 1 AND ${t.quotedFarePoisha}`,
    ),
    check('ride_requests_fee_non_negative', sql`${t.cancellationFeePoisha} >= 0`),
    check(
      'ride_requests_completed_has_fare',
      sql`${t.status} <> 'COMPLETED' OR (${t.finalFarePoisha} IS NOT NULL AND ${t.completedAt} IS NOT NULL)`,
    ),
    check(
      'ride_requests_cancelled_has_actor',
      sql`${t.status} <> 'CANCELLED' OR (${t.cancelledAt} IS NOT NULL AND ${t.cancelledBy} IS NOT NULL)`,
    ),
    // One active ride per passenger; also stops a double-submitted request.
    uniqueIndex('ride_requests_one_active_per_passenger')
      .on(t.passengerId)
      .where(sql`${t.status} IN ('REQUESTED', 'MATCHED', 'IN_PROGRESS')`),
    // The driver feed: waiting requests in the driver's zone, oldest first.
    index('ride_requests_waiting_by_pickup_idx')
      .on(t.pickupZoneId, t.requestedAt)
      .where(sql`${t.status} = 'REQUESTED'`),
    index('ride_requests_passenger_history_idx').on(t.passengerId, t.requestedAt.desc()),
  ],
);

/**
 * One trip of one vehicle, shared by one or more ride requests. Capacity is
 * copied from the vehicle when the driver accepts, and seats_taken is the
 * counter every seat claim updates while holding a row lock on this pool.
 */
export const pools = pgTable(
  'pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    pickupZoneId: smallint('pickup_zone_id')
      .notNull()
      .references(() => zones.id),
    // false = a solo ride: nobody else may join even if seats are free.
    isShared: boolean('is_shared').notNull(),
    capacity: smallint('capacity').notNull(),
    seatsTaken: smallint('seats_taken').notNull().default(0),
    status: poolStatus('status').notNull().default('ACCEPTED'),
    acceptedAt: timestamptz('accepted_at').notNull().defaultNow(),
    arrivedAt: timestamptz('arrived_at'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    cancelledAt: timestamptz('cancelled_at'),
  },
  (t) => [
    check('pools_capacity_range', sql`${t.capacity} BETWEEN 1 AND 6`),
    // Last line of defence for Bullet's seats: even a buggy service cannot overbook.
    check('pools_seats_within_capacity', sql`${t.seatsTaken} BETWEEN 0 AND ${t.capacity}`),
    uniqueIndex('pools_one_active_per_driver')
      .on(t.driverId)
      .where(sql`${t.status} IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED')`),
    // Auto-match candidates: joinable shared pools at a pickup zone, oldest first.
    index('pools_joinable_by_pickup_idx')
      .on(t.pickupZoneId, t.acceptedAt)
      .where(sql`${t.status} = 'ACCEPTED' AND ${t.isShared}`),
    index('pools_driver_history_idx').on(t.driverId, t.acceptedAt.desc()),
  ],
);

/**
 * Who rode (or was going to ride) in which pool. Kept as its own table so
 * history survives re-queueing: when a driver cancels a pool, its members go
 * back to REQUESTED but their membership rows stay, closed with a reason.
 */
export const poolMemberships = pgTable(
  'pool_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pools.id),
    rideRequestId: uuid('ride_request_id')
      .notNull()
      .references(() => rideRequests.id),
    seats: smallint('seats').notNull(),
    dropoffOrder: smallint('dropoff_order'),
    joinedAt: timestamptz('joined_at').notNull().defaultNow(),
    leftAt: timestamptz('left_at'),
    leftReason: membershipLeftReason('left_reason'),
  },
  (t) => [
    check('pool_memberships_seats_positive', sql`${t.seats} >= 1`),
    check(
      'pool_memberships_left_consistent',
      sql`(${t.leftAt} IS NULL) = (${t.leftReason} IS NULL)`,
    ),
    // A request can be in at most one pool at a time.
    uniqueIndex('pool_memberships_one_active_per_request')
      .on(t.rideRequestId)
      .where(sql`${t.leftAt} IS NULL`),
    index('pool_memberships_pool_idx').on(t.poolId),
  ],
);
