import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, smallint, text } from 'drizzle-orm/pg-core';

/** Predefined Dhaka areas; pickups and drop-offs are always one of these. */
export const zones = pgTable('zones', {
  id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull().unique(),
});

/**
 * Invented road distances between zones, in metres. The matrix is symmetric
 * and both directions are stored, so every lookup is a single primary-key hit.
 */
export const zoneDistances = pgTable(
  'zone_distances',
  {
    fromZoneId: smallint('from_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    toZoneId: smallint('to_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    distanceM: integer('distance_m').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromZoneId, t.toZoneId] }),
    check('zone_distances_distinct_zones', sql`${t.fromZoneId} <> ${t.toZoneId}`),
    check('zone_distances_positive', sql`${t.distanceM} > 0`),
  ],
);
