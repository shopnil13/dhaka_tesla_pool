import { sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './columns';
import { rideRequests } from './rides';
import { users } from './users';

/** A passenger's rating of the driver, at most one per completed ride. */
export const ratings = pgTable(
  'ratings',
  {
    rideRequestId: uuid('ride_request_id')
      .primaryKey()
      .references(() => rideRequests.id),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    stars: smallint('stars').notNull(),
    comment: text('comment'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('ratings_stars_range', sql`${t.stars} BETWEEN 1 AND 5`),
    check('ratings_comment_length', sql`char_length(${t.comment}) <= 280`),
    index('ratings_driver_idx').on(t.driverId),
  ],
);
