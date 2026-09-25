import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { poolMemberships } from '../src/db/schema';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { expectPoolConsistent } from './support/pools';
import { fromBanani } from './support/rides';
import { jashimOnlineAtBanani, poolCommands, requestFromBanani } from './support/trips';

const app = createApp();

beforeEach(resetDatabase);

/** Jashim's Bullet with Nusrat (paying `nusratPays`) and Rafiq (cash) aboard, not yet arrived. */
async function bulletWithNusratAndRafiq(nusratPays: 'CASH' | 'TESLAPAY' = 'TESLAPAY') {
  const jashim = await jashimOnlineAtBanani(app);
  const nusrat = await signedInAs(app, 'nusrat');
  const rafiq = await signedInAs(app, 'rafiq');
  const drive = poolCommands(jashim);
  const nusratRide = await requestFromBanani(nusrat, 'mohakhali', { paymentMethod: nusratPays });
  const poolId = await drive.accept(nusratRide.id);
  const rafiqRide = await requestFromBanani(rafiq, 'gulshan-1');
  return { jashim, nusrat, rafiq, drive, poolId, nusratRide, rafiqRide };
}

const cancel = (agent: Awaited<ReturnType<typeof signedInAs>>, rideId: string) =>
  agent.post(`/api/v1/rides/${rideId}/cancel`);

describe('passenger cancellation', () => {
  it('is free while Nusrat is still waiting for a Tesla', async () => {
    const nusrat = await signedInAs(app, 'nusrat');
    const ride = await requestFromBanani(nusrat, 'mohakhali');

    const res = await cancel(nusrat, ride.id);

    expect(res.status).toBe(200);
    expect(res.body.ride).toMatchObject({
      status: 'CANCELLED',
      cancellationFeePoisha: 0,
      payments: [],
      cancellation: { allowed: false },
    });
  });

  it('is free while Bullet is on its way, frees her seat and moves Rafiq up to the 1st stop', async () => {
    const { nusrat, rafiq, poolId, nusratRide, rafiqRide } = await bulletWithNusratAndRafiq();
    expect((await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body.ride.cancellation).toEqual({
      allowed: true,
      feePoisha: 0,
    });

    await cancel(nusrat, nusratRide.id);

    expect((await expectPoolConsistent(poolId)).seatsTaken).toBe(1);
    const [membership] = await db
      .select()
      .from(poolMemberships)
      .where(eq(poolMemberships.rideRequestId, nusratRide.id));
    expect(membership?.leftReason).toBe('PASSENGER_CANCELLED');
    expect((await rafiq.get(`/api/v1/rides/${rafiqRide.id}`)).body.ride.pool).toMatchObject({
      coRiders: 0,
      dropoffOrder: 1,
    });
  });

  it('cancels the pool when its last passenger cancels, freeing Jashim for the next request', async () => {
    const jashim = await jashimOnlineAtBanani(app);
    const nusrat = await signedInAs(app, 'nusrat');
    const ride = await requestFromBanani(nusrat, 'mohakhali');
    await poolCommands(jashim).accept(ride.id);

    await cancel(nusrat, ride.id);

    expect((await jashim.get('/api/v1/driver/pool')).body.pool).toBeNull();
  });

  it('charges ৳30 from TeslaPay once Jashim has arrived', async () => {
    const { nusrat, drive, poolId, nusratRide } = await bulletWithNusratAndRafiq('TESLAPAY');
    await drive.arrive(poolId);
    expect((await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body.ride.cancellation).toEqual({
      allowed: true,
      feePoisha: 3_000,
    });

    const res = await cancel(nusrat, nusratRide.id);

    expect(res.body.ride).toMatchObject({
      cancellationFeePoisha: 3_000,
      payments: [
        { purpose: 'CANCELLATION_FEE', method: 'TESLAPAY', status: 'PAID', amountPoisha: 3_000 },
      ],
    });
    const { wallet } = (await nusrat.get('/api/v1/wallet')).body;
    expect(wallet.balancePoisha).toBe(47_000);
    expect(wallet.transactions[0]).toMatchObject({
      amountPoisha: -3_000,
      description: 'Late cancellation fee',
    });
  });

  it('records a cash late fee as owed, and counts it before the next TeslaPay ride', async () => {
    const shirin = await signedInAs(app, 'shirin'); // ৳50 in TeslaPay
    const jashim = await jashimOnlineAtBanani(app);
    const drive = poolCommands(jashim);
    const ride = await requestFromBanani(shirin, 'mohakhali', { paymentMethod: 'CASH' });
    const poolId = await drive.accept(ride.id);
    await drive.arrive(poolId);

    await cancel(shirin, ride.id);

    const { wallet } = (await shirin.get('/api/v1/wallet')).body;
    expect(wallet).toMatchObject({ balancePoisha: 5_000, duesPoisha: 3_000 });
    await shirin.post('/api/v1/wallet/top-up').send({ amountPoisha: 5_000 }); // now ৳100
    const next = await shirin
      .post('/api/v1/rides')
      .send(fromBanani('mohakhali', { paymentMethod: 'TESLAPAY' }));
    expect(next.status).toBe(422);
    expect(next.body.error.message).toBe(
      'Your TeslaPay balance is ৳100 but this ride needs ৳102 (including ৳30 you owe). Top up or pay cash.',
    );
  });

  it('is refused once the ride has started, and a second time', async () => {
    const { nusrat, rafiq, drive, poolId, nusratRide, rafiqRide } =
      await bulletWithNusratAndRafiq();
    await cancel(nusrat, nusratRide.id);
    await drive.arrive(poolId);
    await drive.start(poolId);

    const afterStart = await cancel(rafiq, rafiqRide.id);
    const twice = await cancel(nusrat, nusratRide.id);

    expect(afterStart.status).toBe(409);
    expect(afterStart.body.error).toMatchObject({
      code: 'CANCEL_NOT_ALLOWED',
      message: 'The ride has already started',
    });
    expect(twice.body.error).toMatchObject({
      code: 'CANCEL_NOT_ALLOWED',
      message: 'The ride is already cancelled',
    });
  });

  it("does not let Rafiq cancel Nusrat's ride", async () => {
    const { rafiq, nusrat, nusratRide } = await bulletWithNusratAndRafiq();

    const res = await cancel(rafiq, nusratRide.id);

    expect(res.status).toBe(404);
    expect((await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body.ride.status).toBe('MATCHED');
  });
});

describe('cancellation races', () => {
  it('Nusrat cancels exactly as Jashim presses Start: one clean outcome, never both', async () => {
    for (let round = 1; round <= 5; round++) {
      await resetDatabase();
      const { nusrat, drive, poolId, nusratRide } = await bulletWithNusratAndRafiq('TESLAPAY');
      await drive.arrive(poolId);

      const [cancelRes, startRes] = await Promise.all([
        cancel(nusrat, nusratRide.id),
        drive.start(poolId),
      ]);

      expect(startRes.status, `round ${round}`).toBe(200);
      const { ride } = (await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body;
      if (cancelRes.status === 200) {
        // Cancel won the pool lock: she paid the late fee and the trip left without her.
        expect(ride).toMatchObject({ status: 'CANCELLED', cancellationFeePoisha: 3_000 });
        expect(startRes.body.pool.members).toHaveLength(1);
      } else {
        // Start won: she is riding, and cancelling is no longer possible.
        expect(cancelRes.body.error.code).toBe('CANCEL_NOT_ALLOWED');
        expect(ride).toMatchObject({ status: 'IN_PROGRESS', cancellationFeePoisha: 0 });
      }
      await expectPoolConsistent(poolId);
    }
  }, 60_000);

  it('Nusrat cancels exactly as Jashim accepts her: she ends up cancelled, free, and Jashim free', async () => {
    for (let round = 1; round <= 5; round++) {
      await resetDatabase();
      const jashim = await jashimOnlineAtBanani(app);
      const nusrat = await signedInAs(app, 'nusrat');
      const ride = await requestFromBanani(nusrat, 'mohakhali');

      const [cancelRes, acceptRes] = await Promise.all([
        cancel(nusrat, ride.id),
        jashim.post(`/api/v1/driver/requests/${ride.id}/accept`),
      ]);

      expect(cancelRes.status, `round ${round}`).toBe(200);
      expect([200, 409]).toContain(acceptRes.status); // 409 = cancel committed first
      expect(cancelRes.body.ride).toMatchObject({ status: 'CANCELLED', cancellationFeePoisha: 0 });
      expect((await jashim.get('/api/v1/driver/pool')).body.pool).toBeNull();
    }
  }, 60_000);
});
