import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { ratings } from '../src/db/schema';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { jashimOnlineAtBanani, poolCommands, requestFromBanani } from './support/trips';

const app = createApp();

beforeEach(resetDatabase);

type Agent = Awaited<ReturnType<typeof signedInAs>>;

const rate = (agent: Agent, rideId: string, body: object) =>
  agent.post(`/api/v1/rides/${rideId}/rating`).send(body);

/** Nusrat and Rafiq share Bullet from Banani; the trip is started but nobody is dropped off. */
async function tripUnderWay() {
  const jashim = await jashimOnlineAtBanani(app);
  const nusrat = await signedInAs(app, 'nusrat');
  const rafiq = await signedInAs(app, 'rafiq');
  const drive = poolCommands(jashim);
  const nusratRide = await requestFromBanani(nusrat, 'mohakhali', { paymentMethod: 'TESLAPAY' });
  const poolId = await drive.accept(nusratRide.id);
  const rafiqRide = await requestFromBanani(rafiq, 'gulshan-1');
  await drive.arrive(poolId);
  await drive.start(poolId);
  return { jashim, nusrat, rafiq, drive, poolId, nusratRide, rafiqRide };
}

async function tripFinished() {
  const trip = await tripUnderWay();
  await trip.drive.dropOff(trip.poolId, trip.nusratRide.id);
  await trip.drive.dropOff(trip.poolId, trip.rafiqRide.id);
  return trip;
}

describe('rating the driver', () => {
  it('lets Nusrat rate Jashim once she has been dropped off', async () => {
    const { nusrat, nusratRide } = await tripFinished();

    const res = await rate(nusrat, nusratRide.id, { stars: 5, comment: '  Spotless Bullet  ' });

    expect(res.status).toBe(201);
    expect(res.body.ride.rating).toMatchObject({ stars: 5, comment: 'Spotless Bullet' });
    expect(res.body.ride.pool.driverRating).toEqual({ average: 5, count: 1 });
  });

  it('stores an empty comment as no comment', async () => {
    const { nusrat, nusratRide } = await tripFinished();

    const res = await rate(nusrat, nusratRide.id, { stars: 4, comment: '   ' });

    expect(res.body.ride.rating).toMatchObject({ stars: 4, comment: null });
  });

  it('accepts only one rating per ride', async () => {
    const { nusrat, nusratRide } = await tripFinished();
    await rate(nusrat, nusratRide.id, { stars: 5 });

    const again = await rate(nusrat, nusratRide.id, { stars: 1 });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_RATED');
  });

  it('keeps exactly one rating when the button is tapped twice at the same instant', async () => {
    const { nusrat, nusratRide } = await tripFinished();

    const results = await Promise.all([
      rate(nusrat, nusratRide.id, { stars: 5 }),
      rate(nusrat, nusratRide.id, { stars: 4 }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.$count(ratings, eq(ratings.rideRequestId, nusratRide.id))).toBe(1);
  });

  it('refuses a ride that is not completed yet, or was cancelled', async () => {
    const { nusrat, drive, poolId, nusratRide } = await tripUnderWay();
    const inProgress = await rate(nusrat, nusratRide.id, { stars: 5 });
    expect(inProgress.status).toBe(409);
    expect(inProgress.body.error.code).toBe('RATING_NOT_ALLOWED');

    await drive.dropOff(poolId, nusratRide.id);
    const shirin = await signedInAs(app, 'shirin');
    const waiting = await requestFromBanani(shirin, 'gulshan-2');
    await shirin.post(`/api/v1/rides/${waiting.id}/cancel`);
    const cancelled = await rate(shirin, waiting.id, { stars: 1 });
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.code).toBe('RATING_NOT_ALLOWED');
  });

  it("is only possible for the ride's own passenger", async () => {
    const { jashim, rafiq, nusratRide } = await tripFinished();

    expect((await rate(rafiq, nusratRide.id, { stars: 1 })).status).toBe(404);
    expect((await rate(jashim, nusratRide.id, { stars: 5 })).status).toBe(403);
  });

  it.each([
    [{ stars: 0 }],
    [{ stars: 6 }],
    [{ stars: 4.5 }],
    [{}],
    [{ stars: 5, comment: 'x'.repeat(281) }],
  ])('rejects an invalid rating %j', async (body) => {
    const { nusrat, nusratRide } = await tripFinished();

    const res = await rate(nusrat, nusratRide.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it("shows the next rider Jashim's average, and each passenger their own stars in history", async () => {
    const { nusrat, rafiq, nusratRide, rafiqRide } = await tripFinished();
    await rate(nusrat, nusratRide.id, { stars: 5 });
    await rate(rafiq, rafiqRide.id, { stars: 4 });

    // Jashim heads back to Banani and picks up Shirin (paying cash).
    const jashim = await jashimOnlineAtBanani(app);
    const shirin = await signedInAs(app, 'shirin');
    const shirinRide = await requestFromBanani(shirin, 'gulshan-2');
    await poolCommands(jashim).accept(shirinRide.id);

    const { ride } = (await shirin.get(`/api/v1/rides/${shirinRide.id}`)).body;
    expect(ride.pool.driverRating).toEqual({ average: 4.5, count: 2 });

    const { rides } = (await rafiq.get('/api/v1/rides')).body;
    expect(rides[0]).toMatchObject({ id: rafiqRide.id, driverName: 'Jashim', stars: 4 });
  });
});
