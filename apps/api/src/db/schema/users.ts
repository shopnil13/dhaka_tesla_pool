import { USER_ROLES } from '@teslapool/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, pgEnum, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './columns';
import { zones } from './zones';

export const userRole = pgEnum('user_role', USER_ROLES);

/** Everyone who can sign in. Role-specific data lives in separate tables. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // Stored lower-cased so the unique constraint is effectively case-insensitive.
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)],
);

/** Driver-only state: availability and where they are waiting for requests. */
export const driverProfiles = pgTable(
  'driver_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    isOnline: boolean('is_online').notNull().default(false),
    currentZoneId: smallint('current_zone_id').references(() => zones.id),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // An online driver must be somewhere, or nobody could be matched to them.
    check(
      'driver_profiles_online_needs_zone',
      sql`NOT ${t.isOnline} OR ${t.currentZoneId} IS NOT NULL`,
    ),
  ],
);

/** A driver's Tesla (e.g. Jashim's Bullet). One per driver; capacity is fixed. */
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .unique()
      .references(() => users.id),
    name: text('name').notNull(),
    plate: text('plate').notNull().unique(),
    capacity: smallint('capacity').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [check('vehicles_capacity_range', sql`${t.capacity} BETWEEN 1 AND 6`)],
);
