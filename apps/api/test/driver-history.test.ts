import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { jashimOnlineAtBanani, poolCommands, requestFromBanani } from './support/trips';

const app = createApp();

beforeEach(resetDatabase);

type Agent = Awaited<ReturnType<typeof signedInAs>>;

const historyOf = async (jashim: Agent) => {
  const res = await jashim.get('/api/v1/driver/history');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.history;
};

/** Nusrat (TeslaPay) accepted by Jashim, then Rafiq (cash) auto-matched into the same Bullet. */
async function nusratAndRafiqInBullet() {
  const jashim = await jashimOnlineAtBanani(app);
  const nusrat = await signedInAs(app, 'nusrat');
  const rafiq = await signedInAs(app, 'rafiq');
  const drive = poolCommands(jashim);
  const nusratRide = await requestFromBanani(nusrat, 'mohakhali', { paymentMethod: 'TESLAPAY' });
  const poolId = await drive.accept(nusratRide.id);
  const rafiqRide = await requestFromBanani(rafiq, 'gulshan-1');
  return { jashim, nusrat, rafiq, drive, poolId, nusratRide, rafiqRide };
}

describe("driver's pool history", () => {
  it('starts empty', async () => {
    const jashim = await signedInAs(app, 'jashim');

    expect(await historyOf(jashim)).toEqual({
      summary: { completedTrips: 0, ridersCarried: 0, earningsPoisha: 0, rating: null },
      pools: [],
    });
  });

  it('lists a finished shared trip with each fare, payment method and rating', async () => {
    const { jashim, nusrat, drive, poolId, nusratRide, rafiqRide } = await nusratAndRafiqInBullet();
    await drive.arrive(poolId);
    await drive.start(poolId);
    await drive.dropOff(poolId, nusratRide.id);
    await drive.dropOff(poolId, rafiqRide.id);
    await nusrat
      .post(`/api/v1/rides/${nusratRide.id}/rating`)
      .send({ stars: 5, comment: 'Smooth ride' });

    const history = await historyOf(jashim);

    expect(history.summary).toEqual({
      completedTrips: 1,
      ridersCarried: 2,
      earningsPoisha: 15_200, // ৳72 + ৳80
      rating: { average: 5, count: 1 },
    });
    expect(history.pools).toHaveLength(1);
    expect(history.pools[0]).toMatchObject({
      id: poolId,
      status: 'COMPLETED',
      pickupZone: 'Banani',
      isShared: true,
      earningsPoisha: 15_200,
      riders: [
        {
          passengerName: 'Nusrat',
          dropoffZone: 'Mohakhali',
          outcome: 'DROPPED_OFF',
          paymentMethod: 'TESLAPAY',
          amountPoisha: 7_200,
          rating: { stars: 5, comment: 'Smooth ride' },
        },
        {
          passengerName: 'Rafiq',
          dropoffZone: 'Gulshan 1',
          outcome: 'DROPPED_OFF',
          paymentMethod: 'CASH',
          amountPoisha: 8_000,
          rating: null,
        },
      ],
    });
  });

  it("counts a late cancel's ৳30 fee, even while the cash is still owed", async () => {
    const { jashim, rafiq, drive, poolId, nusratRide, rafiqRide } = await nusratAndRafiqInBullet();
    await drive.arrive(poolId);
    await rafiq.post(`/api/v1/rides/${rafiqRide.id}/cancel`);
    await drive.start(poolId);
    await drive.dropOff(poolId, nusratRide.id);

    const history = await historyOf(jashim);

    expect(history.summary).toMatchObject({ ridersCarried: 1, earningsPoisha: 10_200 });
    expect(history.pools[0].riders).toEqual([
      expect.objectContaining({ passengerName: 'Nusrat', amountPoisha: 7_200 }),
      expect.objectContaining({
        passengerName: 'Rafiq',
        outcome: 'PASSENGER_CANCELLED',
        amountPoisha: 3_000,
      }),
    ]);
  });

  it('keeps a pool the driver cancelled, earning nothing, and leaves the active pool out', async () => {
    const { jashim, drive, poolId, nusratRide } = await nusratAndRafiqInBullet();
    await jashim.post(`/api/v1/driver/pools/${poolId}/cancel`);
    await drive.accept(nusratRide.id); // Nusrat is back in the queue; a new, active pool

    const history = await historyOf(jashim);

    expect(history.summary).toMatchObject({ completedTrips: 0, earningsPoisha: 0 });
    expect(history.pools).toHaveLength(1);
    expect(history.pools[0]).toMatchObject({ id: poolId, status: 'CANCELLED', earningsPoisha: 0 });
    expect(history.pools[0].riders.map((r: { outcome: string }) => r.outcome)).toEqual([
      'DRIVER_CANCELLED',
      'DRIVER_CANCELLED',
    ]);
  });

  it('is for drivers only', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    expect((await nusrat.get('/api/v1/driver/history')).status).toBe(403);
  });
});
