import { DISTANCES_KM, kmToMetres, ZONES, type ZoneSlug } from '../../src/db/seed-data/zones';
import { createDistanceLookup } from '../../src/domain/matching';

/** Zone ids as the seed assigns them (identity column, in ZONES order). */
export const zoneIdOf = (slug: ZoneSlug) => ZONES.findIndex((zone) => zone.slug === slug) + 1;

/** The seeded distance matrix, without a database. */
export const seedDistances = createDistanceLookup(
  DISTANCES_KM.flatMap(([a, b, km]) => [
    { fromZoneId: zoneIdOf(a), toZoneId: zoneIdOf(b), distanceM: kmToMetres(km) },
    { fromZoneId: zoneIdOf(b), toZoneId: zoneIdOf(a), distanceM: kmToMetres(km) },
  ]),
);
