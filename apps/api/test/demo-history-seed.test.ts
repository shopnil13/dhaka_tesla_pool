import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { pools } from '../src/db/schema';
import { seedDemoHistory } from '../src/db/seedDemoHistory';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { requestFromBanani } from './support/trips';

const app = createApp();

beforeEach(resetDatabase);

describe("seeded demo history: yesterday's shared trip", () => {
  it('reads back through the API exactly like a live trip', async () => {
    const now = new Date();
    expect(await seedDemoHistory(db, now)).toEqual({ created: true });
    const nusrat = await signedInAs(app, 'nusrat');

    const { rides } = (await nusrat.get('/api/v1/rides')).body;
    expect(rides).toEqual([
      expect.objectContaining({
        status: 'COMPLETED',
        dropoffZone: 'Mohakhali',
        farePoisha: 7_200,
        driverName: 'Jashim',
        stars: 5,
      }),
    ]);
    const { ride } = (await nusrat.get(`/api/v1/rides/${rides[0].id}`)).body;
    expect(ride).toMatchObject({
      fareBreakdown: { totalPoisha: 7_200, riders: 2, discountPct: 20 },
      payments: [{ purpose: 'FARE', method: 'TESLAPAY', status: 'PAID', amountPoisha: 7_200 }],
      rating: { stars: 5 },
      pool: { driverName: 'Jashim', dropoffOrder: 1, coRiders: 1 },
    });
    const hoursAgo = (now.getTime() - Date.parse(ride.completedAt)) / 3_600_000;
    expect(hoursAgo).toBeGreaterThan(23);
    expect(hoursAgo).toBeLessThan(24);

    // Word for word what a live trip produces (see ride-timeline.test.ts).
    const { events } = (await nusrat.get(`/api/v1/rides/${ride.id}/events`)).body;
    expect(events.map((e: { title: string; detail: string }) => [e.title, e.detail])).toEqual([
      ['You requested a ride', 'Banani → Mohakhali · upfront fare ৳72'],
      ['Jashim accepted your request', '1 of 3 seats now taken'],
      ['Jashim arrived at Banani', 'Cancelling after this point costs ৳30'],
      ['Trip started', 'Fare locked at ৳72 · 2 bookings sharing the ride'],
      ['Dropped off at Mohakhali', 'Paid ৳72 by TeslaPay'],
    ]);
  });

  it("keeps Nusrat's TeslaPay ledger in order and summing to her balance", async () => {
    await seedDemoHistory(db);
    const nusrat = await signedInAs(app, 'nusrat');

    const { wallet } = (await nusrat.get('/api/v1/wallet')).body;
    expect(wallet.balancePoisha).toBe(42_800); // ৳500 − ৳72
    expect(wallet.transactions).toMatchObject([
      { type: 'DEBIT', amountPoisha: -7_200, balanceAfterPoisha: 42_800, description: 'Ride fare' },
      { type: 'TOPUP', amountPoisha: 50_000, balanceAfterPoisha: 50_000 },
    ]);
  });

  it("gives Jashim a trip in his history and leaves Rafiq's ride for him to rate", async () => {
    await seedDemoHistory(db);
    const jashim = await signedInAs(app, 'jashim');
    const rafiq = await signedInAs(app, 'rafiq');

    const { history } = (await jashim.get('/api/v1/driver/history')).body;
    expect(history.summary).toEqual({
      completedTrips: 1,
      ridersCarried: 2,
      earningsPoisha: 15_200,
      rating: { average: 5, count: 1 },
    });
    expect(history.pools[0].riders.map((r: { passengerName: string }) => r.passengerName)).toEqual([
      'Nusrat',
      'Rafiq',
    ]);

    const [rafiqsRide] = (await rafiq.get('/api/v1/rides')).body.rides;
    expect(rafiqsRide).toMatchObject({ farePoisha: 8_000, stars: null });
    const res = await rafiq.post(`/api/v1/rides/${rafiqsRide.id}/rating`).send({ stars: 4 });
    expect(res.status).toBe(201);
  });

  it('only runs on a world with no rides, so re-running adds nothing', async () => {
    await seedDemoHistory(db);
    expect(await seedDemoHistory(db)).toEqual({ created: false });
    expect(await db.$count(pools)).toBe(1);

    await resetDatabase();
    await requestFromBanani(await signedInAs(app, 'shirin'), 'gulshan-2');
    expect(await seedDemoHistory(db)).toEqual({ created: false });
    expect(await db.$count(pools)).toBe(0);
  });
});
