import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { rideEvents } from '../src/db/schema';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { expectPoolConsistent, jashimsPoolWith } from './support/pools';
import { fromBanani } from './support/rides';

const app = createApp();

beforeEach(resetDatabase);

describe('POST /api/v1/rides', () => {
  it('leaves Nusrat waiting (REQUESTED) while no Tesla is heading out from Banani', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    const res = await nusrat.post('/api/v1/rides').send(fromBanani('mohakhali'));

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'REQUESTED',
      quotedFarePoisha: 7200,
      distanceM: 2500,
      pool: null,
    });
  });

  it('seats Rafiq in Bullet next to Nusrat: overlapping but not identical trips', async () => {
    const pool = await jashimsPoolWith([{ passenger: 'nusrat', to: 'mohakhali' }]);
    const rafiq = await signedInAs(app, 'rafiq');

    const res = await rafiq.post('/api/v1/rides').send(fromBanani('gulshan-1'));

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'MATCHED',
      quotedFarePoisha: 8000,
      pool: {
        id: pool.id,
        status: 'ACCEPTED',
        driverName: 'Jashim',
        vehicle: { name: 'Bullet', capacity: 3 },
        seatsTaken: 2,
        coRiders: 1,
        dropoffOrder: 2, // Nusrat gets off at Mohakhali first
      },
    });
    await expectPoolConsistent(pool.id);
  });

  it('tells Rafiq how many share the Tesla, but never who they are or what they pay', async () => {
    await jashimsPoolWith([{ passenger: 'nusrat', to: 'mohakhali' }]);
    const rafiq = await signedInAs(app, 'rafiq');

    const res = await rafiq.post('/api/v1/rides').send(fromBanani('gulshan-1'));

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/nusrat/i);
    expect(body).not.toContain('7200'); // Nusrat's fare
  });

  it('does not seat Shirin in a pool going the wrong way (Gulshan 2 adds 2.5 km for Nusrat)', async () => {
    const pool = await jashimsPoolWith([{ passenger: 'nusrat', to: 'mohakhali' }]);
    const shirin = await signedInAs(app, 'shirin');

    const res = await shirin.post('/api/v1/rides').send(fromBanani('gulshan-2'));

    expect(res.body.ride).toMatchObject({ status: 'REQUESTED', pool: null });
    expect((await expectPoolConsistent(pool.id)).seatsTaken).toBe(1);
  });

  it('never auto-matches a passenger who asked for a solo ride', async () => {
    await jashimsPoolWith([{ passenger: 'nusrat', to: 'mohakhali' }]);
    const rafiq = await signedInAs(app, 'rafiq');

    const res = await rafiq
      .post('/api/v1/rides')
      .send(fromBanani('gulshan-1', { wantsShare: false }));

    expect(res.body.ride).toMatchObject({ status: 'REQUESTED', quotedFarePoisha: 10000 });
  });

  it('records the history: requested by the passenger, matched by the system', async () => {
    const pool = await jashimsPoolWith([{ passenger: 'nusrat', to: 'mohakhali' }]);
    const rafiq = await signedInAs(app, 'rafiq');

    const res = await rafiq.post('/api/v1/rides').send(fromBanani('gulshan-1'));

    const events = await db
      .select()
      .from(rideEvents)
      .where(eq(rideEvents.rideRequestId, res.body.ride.id))
      .orderBy(asc(rideEvents.id));
    expect(events).toMatchObject([
      { fromStatus: null, toStatus: 'REQUESTED', actorRole: 'PASSENGER' },
      {
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
        actorRole: 'SYSTEM',
        actorId: null,
        metadata: { poolId: pool.id, seatsTaken: 2, capacity: 3 },
      },
    ]);
  });

  it('turns a double-tapped Request button into one ride and one 409', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    const responses = await Promise.all([
      nusrat.post('/api/v1/rides').send(fromBanani('mohakhali')),
      nusrat.post('/api/v1/rides').send(fromBanani('mohakhali')),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 409)?.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });
});
describe('reading rides', () => {
  it('shows Nusrat her own ride, and hides it from Rafiq as if it did not exist', async () => {
    const nusrat = await signedInAs(app, 'nusrat');
    const rafiq = await signedInAs(app, 'rafiq');
    const { body } = await nusrat.post('/api/v1/rides').send(fromBanani('mohakhali'));

    expect((await nusrat.get(`/api/v1/rides/${body.ride.id}`)).status).toBe(200);
    const snooping = await rafiq.get(`/api/v1/rides/${body.ride.id}`);
    expect(snooping.status).toBe(404);
    expect(snooping.body.error.code).toBe('NOT_FOUND');
  });

  it('answers 404, not 500, for ids that are not UUIDs', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    expect((await nusrat.get('/api/v1/rides/not-a-uuid')).status).toBe(404);
  });

  it("returns the active ride, or null, and the passenger's history", async () => {
    const nusrat = await signedInAs(app, 'nusrat');
    expect((await nusrat.get('/api/v1/rides/active')).body.ride).toBeNull();

    const { body } = await nusrat.post('/api/v1/rides').send(fromBanani('mohakhali'));

    expect((await nusrat.get('/api/v1/rides/active')).body.ride.id).toBe(body.ride.id);
    expect((await nusrat.get('/api/v1/rides')).body.rides).toMatchObject([
      { id: body.ride.id, pickupZone: 'Banani', dropoffZone: 'Mohakhali', farePoisha: 7200 },
    ]);
  });

  it('keeps drivers and anonymous callers out of passenger ride endpoints', async () => {
    const jashim = await signedInAs(app, 'jashim');

    expect((await jashim.get('/api/v1/rides')).status).toBe(403);
    expect((await request(app).get('/api/v1/rides')).status).toBe(401);
  });
});
