import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './columns';
import { actorRole, pools, rideRequests } from './rides';
import { users } from './users';

/**
 * Append-only history of every state change, written in the same transaction
 * as the change itself. This is what explains "exactly what happened" to a
 * ride after the fact: who did what, when, from which state, and why.
 */
export const rideEvents = pgTable(
  'ride_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    poolId: uuid('pool_id').references(() => pools.id),
    rideRequestId: uuid('ride_request_id').references(() => rideRequests.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    actorRole: actorRole('actor_role').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    // Each event is about either a pool or a ride request, never both or neither.
    // Two nullable FKs (instead of a polymorphic id) keep referential integrity.
    check(
      'ride_events_exactly_one_subject',
      sql`num_nonnulls(${t.poolId}, ${t.rideRequestId}) = 1`,
    ),
    check(
      'ride_events_system_has_no_actor',
      sql`(${t.actorRole} = 'SYSTEM') = (${t.actorId} IS NULL)`,
    ),
    index('ride_events_ride_request_idx').on(t.rideRequestId, t.createdAt),
    index('ride_events_pool_idx').on(t.poolId, t.createdAt),
  ],
);
