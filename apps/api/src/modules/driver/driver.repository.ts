import { eq } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { driverProfiles, vehicles } from '../../db/schema';
import { AppError } from '../../lib/errors';

/**
 * First step of every driver action: lock the driver's own profile row. This
 * serializes everything one driver does (a double-clicked Accept, accepting
 * while dropping someone off), and it is first in the lock order, so it can
 * never deadlock with passengers, who only ever lock pools and rides.
 */
export async function lockDriver(tx: Tx, driverId: string) {
  const [row] = await tx
    .select({ profile: driverProfiles, vehicle: vehicles })
    .from(driverProfiles)
    .innerJoin(vehicles, eq(vehicles.driverId, driverProfiles.userId))
    .where(eq(driverProfiles.userId, driverId))
    .for('update', { of: driverProfiles });
  if (!row) throw new AppError(403, 'FORBIDDEN', 'No driver profile for this account');
  return row;
}
