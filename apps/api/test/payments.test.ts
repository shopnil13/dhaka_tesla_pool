import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { payments, rideRequests } from '../src/db/schema';
import { loadCast, resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { jashimOnlineAtBanani, poolCommands, requestFromBanani } from './support/trips';
import { zoneIdOf } from './support/zones';

const app = createApp();

beforeEach(resetDatabase);

/** Nusrat (TeslaPay) and Rafiq (cash) share Bullet; returns everyone once the trip has started. */
async function sharedTripUnderWay() {
  const jashim = await jashimOnlineAtBanani(app);
  const nusrat = await signedInAs(app, 'nusrat');
  const rafiq = await signedInAs(app, 'rafiq');
  const drive = poolCommands(jashim);

  const nusratRide = await requestFromBanani(nusrat, 'mohakhali', { paymentMethod: 'TESLAPAY' });
  const poolId = await drive.accept(nusratRide.id);
  const rafiqRide = await requestFromBanani(rafiq, 'gulshan-1'); // cash, auto-matched
  await drive.arrive(poolId);
  await drive.start(poolId);
  return { jashim, nusrat, rafiq, drive, poolId, nusratRide, rafiqRide };
}

describe('paying at drop-off', () => {
  it('debits Nusrat ৳72 from TeslaPay the moment she is dropped off', async () => {
    const { nusrat, drive, poolId, nusratRide } = await sharedTripUnderWay();

    await drive.dropOff(poolId, nusratRide.id);

    const { wallet } = (await nusrat.get('/api/v1/wallet')).body;
    expect(wallet.balancePoisha).toBe(42_800); // ৳500 − ৳72
    expect(wallet.transactions[0]).toMatchObject({
      type: 'DEBIT',
      amountPoisha: -7_200,
      balanceAfterPoisha: 42_800,
      description: 'Ride fare',
    });
    const { ride } = (await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body;
    expect(ride.payments).toEqual([
      { purpose: 'FARE', method: 'TESLAPAY', status: 'PAID', amountPoisha: 7_200 },
    ]);
  });

  it("records Rafiq's ৳80 cash fare as collected and leaves his wallet alone", async () => {
    const { rafiq, drive, poolId, nusratRide, rafiqRide } = await sharedTripUnderWay();

    await drive.dropOff(poolId, nusratRide.id);
    await drive.dropOff(poolId, rafiqRide.id);

    const { ride } = (await rafiq.get(`/api/v1/rides/${rafiqRide.id}`)).body;
    expect(ride.payments).toEqual([
      { purpose: 'FARE', method: 'CASH', status: 'PAID', amountPoisha: 8_000 },
    ]);
    expect((await rafiq.get('/api/v1/wallet')).body.wallet.balancePoisha).toBe(30_000);
  });

  it('collects an old unpaid cash fee together with the next fare', async () => {
    // Rafiq owes ৳30 from a cash ride he cancelled after the driver arrived.
    const cast = await loadCast();
    const [oldRide] = await db
      .insert(rideRequests)
      .values({
        passengerId: cast.rafiq,
        pickupZoneId: zoneIdOf('banani'),
        dropoffZoneId: zoneIdOf('gulshan-1'),
        seats: 1,
        wantsShare: true,
        paymentMethod: 'CASH',
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: 'PASSENGER',
        cancellationFeePoisha: 3_000,
        directDistanceM: 3_000,
        quotedFarePoisha: 8_000,
      })
      .returning();
    const [due] = await db
      .insert(payments)
      .values({
        passengerId: cast.rafiq,
        rideRequestId: oldRide!.id,
        purpose: 'CANCELLATION_FEE',
        method: 'CASH',
        amountPoisha: 3_000,
        status: 'DUE',
      })
      .returning();

    const { jashim, drive, poolId, nusratRide, rafiqRide } = await sharedTripUnderWay();
    const pool = (await jashim.get('/api/v1/driver/pool')).body.pool;
    expect(
      pool.members.find((m: { passengerName: string }) => m.passengerName === 'Rafiq'),
    ).toMatchObject({
      finalFarePoisha: 8_000,
      duesPoisha: 3_000, // Jashim collects ৳110 in cash
    });

    await drive.dropOff(poolId, nusratRide.id);
    await drive.dropOff(poolId, rafiqRide.id);

    const [settled] = await db.select().from(payments).where(eq(payments.id, due!.id));
    expect(settled).toMatchObject({ status: 'PAID', settledInRideRequestId: rafiqRide.id });
  });
});
