import type { Zone } from '@teslapool/shared';
import { asc } from 'drizzle-orm';
import { db } from '../../db/client';
import { zoneDistances, zones } from '../../db/schema';
import { createDistanceLookup, type DistanceLookup } from '../../domain/matching';
import { AppError } from '../../lib/errors';

export interface ZoneMap {
  zones: Zone[];
  distance: DistanceLookup;
}

// Zones and distances are static reference data (81 cells), so they are read
// once and kept in memory instead of being queried on every match.
let cached: Promise<ZoneMap> | undefined;

export function loadZoneMap(): Promise<ZoneMap> {
  cached ??= (async () => {
    const [zoneRows, distanceRows] = await Promise.all([
      db.select().from(zones).orderBy(asc(zones.id)),
      db.select().from(zoneDistances),
    ]);
    return { zones: zoneRows, distance: createDistanceLookup(distanceRows) };
  })().catch((err: unknown) => {
    cached = undefined; // do not cache a failure
    throw err;
  });
  return cached;
}

/** 400 with a field error when a zone id from the client does not exist. */
export function assertKnownZones(map: ZoneMap, fields: Record<string, number>) {
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, id] of Object.entries(fields)) {
    if (!map.zones.some((zone) => zone.id === id)) fieldErrors[field] = ['Unknown zone'];
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown zone', { fieldErrors, formErrors: [] });
  }
}
