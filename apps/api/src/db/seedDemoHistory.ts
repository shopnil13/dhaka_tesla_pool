import type { ActorRole } from '@teslapool/shared';
import { eq, inArray } from 'drizzle-orm';
import { finalFare, quoteFare } from '../domain/fare';
import { createDistanceLookup, planRoute } from '../domain/matching';
import type { Db, Tx } from './client';
import {
  payments,
  poolMemberships,
  pools,
  ratings,
  rideEvents,
  rideRequests,
  users,
  vehicles,
  walletAccounts,
  walletTransactions,
  zoneDistances,
  zones,
} from './schema';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Yesterday's trip, so the history screens are not empty in a fresh demo:
 * Nusrat (TeslaPay, to Mohakhali) and Rafiq (cash, to Gulshan 1) shared
 * Jashim's Bullet from Banani, paying ৳72 and ৳80. Nusrat rated it 5★;
 * Rafiq has not rated yet, so the demo can show rating live.
 *
 * Fares and the drop-off order come from the real domain functions, and the
 * rows are the ones the services write (events, payments, ledger), dated a
 * day back; a test reads it all back through the API. Only runs on a world
 * with no rides yet, so it never mixes into real data and re-running is
 * harmless. Not part of the test reset: tests start from an empty history.
 */
export async function seedDemoHistory(db: Db, now = new Date()): Promise<{ created: boolean }> {
  return db.transaction(async (tx) => {
    if ((await tx.$count(rideRequests)) > 0) return { created: false };

    const cast = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        inArray(users.email, [
          'jashim@teslapool.test',
          'nusrat@teslapool.test',
          'rafiq@teslapool.test',
        ]),
      );
    const idOf = (name: string) => {
      const id = cast.find((user) => user.email === `${name}@teslapool.test`)?.id;
      if (!id) throw new Error(`Seed the cast before the demo history (missing ${name})`);
      return id;
    };
    const [jashim, nusrat, rafiq] = [idOf('jashim'), idOf('nusrat'), idOf('rafiq')];
    const [bullet] = await tx.select().from(vehicles).where(eq(vehicles.driverId, jashim));
    const zoneRows = await tx.select().from(zones);
    const zoneId = (slug: string) => zoneRows.find((zone) => zone.slug === slug)!.id;
    const distance = createDistanceLookup(await tx.select().from(zoneDistances));
    const [banani, mohakhali, gulshan1] = [
      zoneId('banani'),
      zoneId('mohakhali'),
      zoneId('gulshan-1'),
    ];

    // The story, in minutes after Nusrat's request yesterday.
    const start = now.getTime() - DAY;
    const at = (minutes: number) => new Date(start + minutes * MINUTE);

    const trip = (dropoff: number) => ({
      distanceM: distance(banani, dropoff),
      seats: 1,
      wantsShare: true,
    });
    const nusratTrip = trip(mohakhali);
    const rafiqTrip = trip(gulshan1);
    const nusratQuote = quoteFare(nusratTrip);
    const rafiqQuote = quoteFare(rafiqTrip);
    const nusratFare = finalFare(nusratTrip, 2, nusratQuote.totalPoisha); // ৳72
    const rafiqFare = finalFare(rafiqTrip, 2, rafiqQuote.totalPoisha); // ৳80

    const ride = (passengerId: string, dropoff: number, times: number[]) => ({
      passengerId,
      pickupZoneId: banani,
      dropoffZoneId: dropoff,
      seats: 1,
      wantsShare: true,
      status: 'COMPLETED' as const,
      requestedAt: at(times[0]!),
      matchedAt: at(times[1]!),
      startedAt: at(11),
      completedAt: at(times[2]!),
    });
    const [nusratRide] = await tx
      .insert(rideRequests)
      .values({
        ...ride(nusrat, mohakhali, [0, 2, 21]),
        paymentMethod: 'TESLAPAY',
        directDistanceM: nusratTrip.distanceM,
        quotedFarePoisha: nusratQuote.totalPoisha,
        finalFarePoisha: nusratFare.totalPoisha,
        fareBreakdown: nusratFare,
      })
      .returning();
    const [rafiqRide] = await tx
      .insert(rideRequests)
      .values({
        ...ride(rafiq, gulshan1, [4, 4, 28]),
        paymentMethod: 'CASH',
        directDistanceM: rafiqTrip.distanceM,
        quotedFarePoisha: rafiqQuote.totalPoisha,
        finalFarePoisha: rafiqFare.totalPoisha,
        fareBreakdown: rafiqFare,
      })
      .returning();

    const [pool] = await tx
      .insert(pools)
      .values({
        driverId: jashim,
        vehicleId: bullet!.id,
        pickupZoneId: banani,
        isShared: true,
        capacity: bullet!.capacity,
        seatsTaken: 2,
        status: 'COMPLETED',
        acceptedAt: at(2),
        arrivedAt: at(9),
        startedAt: at(11),
        completedAt: at(28),
      })
      .returning();
    const route = planRoute(
      banani,
      [
        { rideRequestId: nusratRide!.id, dropoffZoneId: mohakhali, seats: 1 },
        { rideRequestId: rafiqRide!.id, dropoffZoneId: gulshan1, seats: 1 },
      ],
      distance,
    );
    const stopOf = (rideId: string) =>
      route.stops.findIndex((stop) => stop.rideRequestIds.includes(rideId)) + 1;
    await tx.insert(poolMemberships).values([
      {
        poolId: pool!.id,
        rideRequestId: nusratRide!.id,
        seats: 1,
        dropoffOrder: stopOf(nusratRide!.id),
        joinedAt: at(2),
      },
      {
        poolId: pool!.id,
        rideRequestId: rafiqRide!.id,
        seats: 1,
        dropoffOrder: stopOf(rafiqRide!.id),
        joinedAt: at(4),
      },
    ]);

    const [nusratPayment] = await tx
      .insert(payments)
      .values({
        passengerId: nusrat,
        rideRequestId: nusratRide!.id,
        purpose: 'FARE',
        method: 'TESLAPAY',
        amountPoisha: nusratFare.totalPoisha,
        status: 'PAID',
        createdAt: at(21),
        paidAt: at(21),
      })
      .returning();
    await tx.insert(payments).values({
      passengerId: rafiq,
      rideRequestId: rafiqRide!.id,
      purpose: 'FARE',
      method: 'CASH',
      amountPoisha: rafiqFare.totalPoisha,
      status: 'PAID',
      createdAt: at(28),
      paidAt: at(28),
    });
    await debitYesterday(tx, nusrat, nusratFare.totalPoisha, nusratPayment!.id, at(21), at(-60));

    const poolEvent = (minutes: number, event: EventFields) => ({
      ...event,
      poolId: pool!.id,
      createdAt: at(minutes),
    });
    const rideEvent = (minutes: number, rideId: string, event: EventFields) => ({
      ...event,
      rideRequestId: rideId,
      createdAt: at(minutes),
    });
    const driver = { actorId: jashim, actorRole: 'DRIVER' } as const;
    const joined = (seatsTaken: number) => ({ poolId: pool!.id, seatsTaken, capacity: 3 });
    const aboard = (fare: number) => ({ finalFarePoisha: fare, ridersAtStart: 2 });
    const paid = (fare: number, method: 'CASH' | 'TESLAPAY') => ({
      farePoisha: fare,
      duesPoisha: 0,
      method,
    });

    // Same shapes, reasons and order as the services write them.
    await tx.insert(rideEvents).values([
      rideEvent(0, nusratRide!.id, {
        ...passenger(nusrat),
        fromStatus: null,
        toStatus: 'REQUESTED',
        metadata: { quote: nusratQuote },
      }),
      poolEvent(2, {
        ...driver,
        fromStatus: null,
        toStatus: 'ACCEPTED',
        metadata: { vehicle: bullet!.name, capacity: bullet!.capacity, shared: true },
      }),
      rideEvent(2, nusratRide!.id, {
        ...driver,
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        reason: 'Accepted by the driver',
        metadata: joined(1),
      }),
      rideEvent(4, rafiqRide!.id, {
        ...passenger(rafiq),
        fromStatus: null,
        toStatus: 'REQUESTED',
        metadata: { quote: rafiqQuote },
      }),
      rideEvent(4, rafiqRide!.id, {
        actorId: null,
        actorRole: 'SYSTEM',
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        reason: 'Auto-matched into a pool leaving from the same pickup',
        metadata: joined(2),
      }),
      poolEvent(9, { ...driver, fromStatus: 'ACCEPTED', toStatus: 'DRIVER_ARRIVED' }),
      rideEvent(11, nusratRide!.id, {
        ...driver,
        fromStatus: 'MATCHED',
        toStatus: 'IN_PROGRESS',
        metadata: aboard(nusratFare.totalPoisha),
      }),
      rideEvent(11, rafiqRide!.id, {
        ...driver,
        fromStatus: 'MATCHED',
        toStatus: 'IN_PROGRESS',
        metadata: aboard(rafiqFare.totalPoisha),
      }),
      poolEvent(11, {
        ...driver,
        fromStatus: 'DRIVER_ARRIVED',
        toStatus: 'STARTED',
        metadata: { riders: 2, seatsTaken: 2 },
      }),
      rideEvent(21, nusratRide!.id, {
        ...driver,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'COMPLETED',
        reason: 'Dropped off',
        metadata: paid(nusratFare.totalPoisha, 'TESLAPAY'),
      }),
      rideEvent(28, rafiqRide!.id, {
        ...driver,
        fromStatus: 'IN_PROGRESS',
        toStatus: 'COMPLETED',
        reason: 'Dropped off',
        metadata: paid(rafiqFare.totalPoisha, 'CASH'),
      }),
      poolEvent(28, {
        actorId: null,
        actorRole: 'SYSTEM',
        fromStatus: 'STARTED',
        toStatus: 'COMPLETED',
        reason: 'Last passenger dropped off',
      }),
    ]);

    await tx.insert(ratings).values({
      rideRequestId: nusratRide!.id,
      passengerId: nusrat,
      driverId: jashim,
      stars: 5,
      comment: 'Smooth ride, and Bullet was spotless.',
      createdAt: at(35),
    });

    return { created: true };
  });
}

interface EventFields {
  actorId: string | null;
  actorRole: ActorRole;
  fromStatus: string | null;
  toStatus: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const passenger = (id: string) => ({ actorId: id, actorRole: 'PASSENGER' }) as const;

/**
 * Nusrat's TeslaPay fare, as debitWallet records it but dated yesterday. Her
 * opening balance is moved to before the trip, so the ledger still reads in
 * order and still sums to the balance.
 */
async function debitYesterday(
  tx: Tx,
  userId: string,
  amountPoisha: number,
  paymentId: string,
  when: Date,
  openedAt: Date,
) {
  await tx
    .update(walletTransactions)
    .set({ createdAt: openedAt })
    .where(eq(walletTransactions.userId, userId));
  const [wallet] = await tx
    .select()
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, userId))
    .for('update');
  const balanceAfterPoisha = wallet!.balancePoisha - amountPoisha;
  await tx
    .update(walletAccounts)
    .set({ balancePoisha: balanceAfterPoisha })
    .where(eq(walletAccounts.userId, userId));
  await tx.insert(walletTransactions).values({
    userId,
    paymentId,
    type: 'DEBIT',
    amountPoisha: -amountPoisha,
    balanceAfterPoisha,
    createdAt: when,
  });
}
