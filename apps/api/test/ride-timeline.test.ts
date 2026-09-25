import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { jashimOnlineAtBanani, poolCommands, requestFromBanani } from './support/trips';

const app = createApp();

beforeEach(resetDatabase);

type Agent = Awaited<ReturnType<typeof signedInAs>>;

const timeline = async (agent: Agent, rideId: string) => {
  const res = await agent.get(`/api/v1/rides/${rideId}/events`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.events as { kind: string; title: string; detail: string | null }[];
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

describe('ride timeline', () => {
  it("tells Nusrat's shared trip in order, in plain words", async () => {
    const { nusrat, drive, poolId, nusratRide } = await nusratAndRafiqInBullet();
    await drive.arrive(poolId);
    await drive.start(poolId);
    await drive.dropOff(poolId, nusratRide.id);

    expect(await timeline(nusrat, nusratRide.id)).toEqual([
      expect.objectContaining({
        kind: 'REQUESTED',
        title: 'You requested a ride',
        detail: 'Banani → Mohakhali · upfront fare ৳72',
      }),
      expect.objectContaining({
        kind: 'MATCHED',
        title: 'Jashim accepted your request',
        detail: '1 of 3 seats now taken',
      }),
      expect.objectContaining({ kind: 'DRIVER_ARRIVED', title: 'Jashim arrived at Banani' }),
      expect.objectContaining({
        kind: 'STARTED',
        title: 'Trip started',
        detail: 'Fare locked at ৳72 · 2 bookings sharing the ride',
      }),
      expect.objectContaining({
        kind: 'COMPLETED',
        title: 'Dropped off at Mohakhali',
        detail: 'Paid ৳72 by TeslaPay',
      }),
    ]);
  });

  it('says when a rider was auto-matched rather than accepted', async () => {
    const { rafiq, rafiqRide } = await nusratAndRafiqInBullet();

    const [, matched] = await timeline(rafiq, rafiqRide.id);
    expect(matched).toMatchObject({
      kind: 'MATCHED',
      title: 'Matched into a shared Tesla',
      detail: '2 of 3 seats now taken',
    });
  });

  it('never names or prices the other riders, and keeps the stored metadata server-side', async () => {
    const { nusrat, drive, poolId, nusratRide } = await nusratAndRafiqInBullet();
    await drive.arrive(poolId);
    await drive.start(poolId);

    const res = await nusrat.get(`/api/v1/rides/${nusratRide.id}/events`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Rafiq');
    expect(body).not.toContain('৳80'); // Rafiq's fare
    expect(body).not.toContain('metadata');
    expect(body).not.toContain(poolId);
  });

  it("is only readable by the ride's own passenger", async () => {
    const { jashim, rafiq, nusratRide } = await nusratAndRafiqInBullet();

    expect((await rafiq.get(`/api/v1/rides/${nusratRide.id}/events`)).status).toBe(404);
    expect((await jashim.get(`/api/v1/rides/${nusratRide.id}/events`)).status).toBe(403);
  });

  it('does not show an arrival to someone who had already cancelled', async () => {
    const { nusrat, rafiq, drive, poolId, nusratRide, rafiqRide } = await nusratAndRafiqInBullet();
    await rafiq.post(`/api/v1/rides/${rafiqRide.id}/cancel`);
    await drive.arrive(poolId);

    expect((await timeline(rafiq, rafiqRide.id)).map((e) => e.kind)).toEqual([
      'REQUESTED',
      'MATCHED',
      'CANCELLED',
    ]);
    expect((await timeline(nusrat, nusratRide.id)).map((e) => e.kind)).toContain('DRIVER_ARRIVED');
  });

  it('shows the arrival that made a late cancel cost ৳30', async () => {
    const { nusrat, drive, poolId, nusratRide } = await nusratAndRafiqInBullet();
    await drive.arrive(poolId);
    await nusrat.post(`/api/v1/rides/${nusratRide.id}/cancel`);

    const events = await timeline(nusrat, nusratRide.id);
    expect(events.map((e) => e.kind)).toEqual([
      'REQUESTED',
      'MATCHED',
      'DRIVER_ARRIVED',
      'CANCELLED',
    ]);
    expect(events.at(-1)).toMatchObject({
      title: 'You cancelled',
      detail: 'Late fee ৳30 paid by TeslaPay',
    });
  });

  it('tells a cash rider their late fee is still owed', async () => {
    const { rafiq, drive, poolId, rafiqRide } = await nusratAndRafiqInBullet();
    await drive.arrive(poolId);
    await rafiq.post(`/api/v1/rides/${rafiqRide.id}/cancel`);

    expect((await timeline(rafiq, rafiqRide.id)).at(-1)).toMatchObject({
      kind: 'CANCELLED',
      detail: 'Late fee ৳30, collected with your next ride',
    });
  });

  it('explains being put back in the queue when the driver cancels', async () => {
    const { jashim, nusrat, poolId, nusratRide } = await nusratAndRafiqInBullet();
    await jashim.post(`/api/v1/driver/pools/${poolId}/cancel`);

    expect((await timeline(nusrat, nusratRide.id)).at(-1)).toMatchObject({
      kind: 'REQUEUED',
      title: 'Jashim cancelled the trip',
      detail: 'You are waiting for a Tesla again, at no charge',
    });
  });
});
