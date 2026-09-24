import { sql } from 'drizzle-orm';
import { hashPassword } from '../lib/password';
import type { Db } from './client';
import {
  driverProfiles,
  users,
  vehicles,
  walletAccounts,
  walletTransactions,
  zoneDistances,
  zones,
} from './schema';
import { DRIVERS, PASSENGERS } from './seed-data/cast';
import { DISTANCES_KM, kmToMetres, ZONES } from './seed-data/zones';

export interface SeedResult {
  zones: number;
  usersCreated: number;
  usersSkipped: number;
}

/**
 * Idempotent: zones and distances are upserted; people are only created if
 * their email does not exist yet, so re-running never resets anyone's wallet
 * or history. Runs in one transaction, so a failure leaves nothing half-seeded.
 */
export async function seedDatabase(db: Db, demoPassword: string): Promise<SeedResult> {
  const passwordHash = await hashPassword(demoPassword);

  return db.transaction(async (tx) => {
    const zoneRows = await tx
      .insert(zones)
      .values(ZONES.map(({ slug, name }) => ({ slug, name })))
      .onConflictDoUpdate({ target: zones.slug, set: { name: sql`excluded.name` } })
      .returning({ id: zones.id, slug: zones.slug });
    const zoneId = (slug: string) => {
      const id = zoneRows.find((z) => z.slug === slug)?.id;
      if (id === undefined) throw new Error(`Unknown zone slug: ${slug}`);
      return id;
    };

    // Store both directions so a lookup never has to care about order.
    const distanceRows = DISTANCES_KM.flatMap(([a, b, km]) => [
      { fromZoneId: zoneId(a), toZoneId: zoneId(b), distanceM: kmToMetres(km) },
      { fromZoneId: zoneId(b), toZoneId: zoneId(a), distanceM: kmToMetres(km) },
    ]);
    await tx
      .insert(zoneDistances)
      .values(distanceRows)
      .onConflictDoUpdate({
        target: [zoneDistances.fromZoneId, zoneDistances.toZoneId],
        set: { distanceM: sql`excluded.distance_m` },
      });

    let usersCreated = 0;
    let usersSkipped = 0;

    for (const driver of DRIVERS) {
      const [created] = await tx
        .insert(users)
        .values({ name: driver.name, email: driver.email, passwordHash, role: 'DRIVER' })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!created) {
        usersSkipped++;
        continue;
      }
      usersCreated++;
      await tx
        .insert(driverProfiles)
        .values({ userId: created.id, currentZoneId: zoneId(driver.startZone) });
      await tx.insert(vehicles).values({ driverId: created.id, ...driver.vehicle });
    }

    for (const passenger of PASSENGERS) {
      const [created] = await tx
        .insert(users)
        .values({ name: passenger.name, email: passenger.email, passwordHash, role: 'PASSENGER' })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!created) {
        usersSkipped++;
        continue;
      }
      usersCreated++;
      // The opening balance goes through the ledger like any top-up, so the
      // balance always equals the sum of the wallet's transactions.
      await tx
        .insert(walletAccounts)
        .values({ userId: created.id, balancePoisha: passenger.walletPoisha });
      await tx.insert(walletTransactions).values({
        userId: created.id,
        type: 'TOPUP',
        amountPoisha: passenger.walletPoisha,
        balanceAfterPoisha: passenger.walletPoisha,
      });
    }

    return { zones: zoneRows.length, usersCreated, usersSkipped };
  });
}
