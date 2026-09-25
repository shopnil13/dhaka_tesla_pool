import { asc, eq } from 'drizzle-orm';
import type { Express } from 'express';
import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { driverProfiles, poolMemberships, rideEvents, users, vehicles } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';
import { resetDatabase, TEST_PASSWORD } from './support/db';
import { signedInAs } from './support/http';
import { expectPoolConsistent } from './support/pools';
import { fromBanani } from './support/rides';
import { zoneIdOf } from './support/zones';

const app: Express = createApp();

beforeEach(resetDatabase);

/** Karim and his Tesla "Rocket" exist only in this test file: a second driver for access checks. */
async function secondDriverSignedIn() {
  const [karim] = await db
    .insert(users)
    .values({
      name: 'Karim',
      email: 'karim@teslapool.test',
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: 'DRIVER',
    })
    .returning();
  await db
    .insert(driverProfiles)
    .values({ userId: karim!.id, isOnline: true, currentZoneId: zoneIdOf('banani') });
  await db
    .insert(vehicles)
    .values({ driverId: karim!.id, name: 'Rocket', plate: 'DHAKA-TESLA-22', capacity: 3 });
  const agent = supertest.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .send({ email: 'karim@teslapool.test', password: TEST_PASSWORD });
  return agent;
}

async function jashimOnlineAtBanani() {
  const jashim = await signedInAs(app, 'jashim');
  const res = await jashim
    .patch('/api/v1/driver/status')
    .send({ isOnline: true, currentZoneId: zoneIdOf('banani') });
  expect(res.status).toBe(200);
  return jashim;
}

const request = async (agent: TestAgent, to: Parameters<typeof fromBanani>[0], extra = {}) =>
  (await agent.post('/api/v1/rides').send(fromBanani(to, extra))).body.ride as {
    id: string;
    status: string;
  };

describe('the Banani rush-hour story, end to end', () => {
  it('Jashim pools Nusrat and Rafiq, drives, drops them off, and each pays their own fare', async () => {
    const jashim = await jashimOnlineAtBanani();
    const nusrat = await signedInAs(app, 'nusrat');
    const rafiq = await signedInAs(app, 'rafiq');

    // 8:41 — Nusrat books; no Tesla out yet, so she waits in Jashim's feed.
    const nusratRide = await request(nusrat, 'mohakhali');
    expect(nusratRide.status).toBe('REQUESTED');
    const feed = (await jashim.get('/api/v1/driver/requests')).body.requests;
    expect(feed).toMatchObject([{ passengerName: 'Nusrat', canAccept: true, reason: null }]);

    // Jashim accepts: Bullet's pool is born with Nusrat in it.
    const accepted = await jashim.post(`/api/v1/driver/requests/${nusratRide.id}/accept`);
    expect(accepted.status).toBe(200);
    const poolId: string = accepted.body.pool.id;
    expect(accepted.body.pool).toMatchObject({ status: 'ACCEPTED', seatsTaken: 1, capacity: 3 });

    // Two minutes later Rafiq books a similar trip and is auto-matched into Bullet.
    const rafiqRide = await request(rafiq, 'gulshan-1');
    expect(rafiqRide.status).toBe('MATCHED');

    // Jashim sees who is riding, in drop-off order.
    const pool = (await jashim.get('/api/v1/driver/pool')).body.pool;
    expect(pool.members).toMatchObject([
      { passengerName: 'Nusrat', dropoffZone: 'Mohakhali', dropoffOrder: 1, status: 'MATCHED' },
      { passengerName: 'Rafiq', dropoffZone: 'Gulshan 1', dropoffOrder: 2, status: 'MATCHED' },
    ]);

    // Arrive, start: fares are frozen for two riders (৳72 and ৳80).
    expect((await jashim.post(`/api/v1/driver/pools/${poolId}/arrive`)).status).toBe(200);
    const started = await jashim.post(`/api/v1/driver/pools/${poolId}/start`);
    expect(started.body.pool.status).toBe('STARTED');
    expect(
      started.body.pool.members.map((m: { finalFarePoisha: number }) => m.finalFarePoisha),
    ).toEqual([7200, 8000]);
    expect((await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body.ride).toMatchObject({
      status: 'IN_PROGRESS',
      finalFarePoisha: 7200,
      fareBreakdown: { riders: 2, discountPct: 20 },
    });

    // Mohakhali: Nusrat gets off; Rafiq is still riding.
    const firstDrop = await jashim.post(
      `/api/v1/driver/pools/${poolId}/riders/${nusratRide.id}/drop-off`,
    );
    expect(firstDrop.body.pool.status).toBe('STARTED');
    expect((await nusrat.get(`/api/v1/rides/${nusratRide.id}`)).body.ride.status).toBe('COMPLETED');

    // Gulshan 1: the last drop-off completes the pool; Jashim is now waiting in Gulshan 1.
    const lastDrop = await jashim.post(
      `/api/v1/driver/pools/${poolId}/riders/${rafiqRide.id}/drop-off`,
    );
    expect(lastDrop.body.pool).toBeNull();
    expect((await jashim.get('/api/v1/driver/profile')).body.driver.zone.name).toBe('Gulshan 1');

    // Every step is on record for the pool.
    const poolHistory = await db
      .select({ to: rideEvents.toStatus, actor: rideEvents.actorRole })
      .from(rideEvents)
      .where(eq(rideEvents.poolId, poolId))
      .orderBy(asc(rideEvents.id));
    expect(poolHistory).toEqual([
      { to: 'ACCEPTED', actor: 'DRIVER' },
      { to: 'DRIVER_ARRIVED', actor: 'DRIVER' },
      { to: 'STARTED', actor: 'DRIVER' },
      { to: 'COMPLETED', actor: 'SYSTEM' },
    ]);
  });
});

describe('driver feed and accepting', () => {
  it("explains why Shirin's Gulshan 2 request does not fit Bullet's pool", async () => {
    const jashim = await jashimOnlineAtBanani();
    const nusratRide = await request(await signedInAs(app, 'nusrat'), 'mohakhali');
    await jashim.post(`/api/v1/driver/requests/${nusratRide.id}/accept`);
    const shirinRide = await request(await signedInAs(app, 'shirin'), 'gulshan-2');

    const feed = (await jashim.get('/api/v1/driver/requests')).body.requests;
    expect(feed).toMatchObject([
      {
        rideRequestId: shirinRide.id,
        canAccept: false,
        reason: "Sharing would add 2.5 km to someone's trip (limit 2 km)",
      },
    ]);
    const forced = await jashim.post(`/api/v1/driver/requests/${shirinRide.id}/accept`);
    expect(forced.status).toBe(422);
    expect(forced.body.error.code).toBe('NOT_COMPATIBLE');
  });

  it('shows nothing and accepts nothing while Jashim is offline', async () => {
    const jashim = await signedInAs(app, 'jashim');
    const nusratRide = await request(await signedInAs(app, 'nusrat'), 'mohakhali');

    expect((await jashim.get('/api/v1/driver/requests')).body.requests).toEqual([]);
    const res = await jashim.post(`/api/v1/driver/requests/${nusratRide.id}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it('turns a double-clicked Accept into one pool and one 409', async () => {
    const jashim = await jashimOnlineAtBanani();
    const nusratRide = await request(await signedInAs(app, 'nusrat'), 'mohakhali');

    const [a, b] = await Promise.all([
      jashim.post(`/api/v1/driver/requests/${nusratRide.id}/accept`),
      jashim.post(`/api/v1/driver/requests/${nusratRide.id}/accept`),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const poolId = (a.status === 200 ? a : b).body.pool.id;
    expect((await expectPoolConsistent(poolId)).seatsTaken).toBe(1);
  });

  it('never seats a solo passenger in a shared pool', async () => {
    const jashim = await jashimOnlineAtBanani();
    const nusratRide = await request(await signedInAs(app, 'nusrat'), 'mohakhali');
    await jashim.post(`/api/v1/driver/requests/${nusratRide.id}/accept`);
    const soloRafiq = await request(await signedInAs(app, 'rafiq'), 'gulshan-1', {
      wantsShare: false,
    });

    const res = await jashim.post(`/api/v1/driver/requests/${soloRafiq.id}/accept`);
    expect(res.body.error).toMatchObject({
      code: 'NOT_COMPATIBLE',
      details: { reason: 'NOT_SHARED' },
    });
  });
});

describe('pool lifecycle rules', () => {
  async function poolWithNusrat() {
    const jashim = await jashimOnlineAtBanani();
    const nusrat = await signedInAs(app, 'nusrat');
    const ride = await request(nusrat, 'mohakhali');
    const pool = (await jashim.post(`/api/v1/driver/requests/${ride.id}/accept`)).body.pool;
    return { jashim, nusrat, rideId: ride.id, poolId: pool.id as string };
  }

  it('rejects starting before arriving, dropping off before starting, and arriving twice', async () => {
    const { jashim, poolId, rideId } = await poolWithNusrat();

    const earlyStart = await jashim.post(`/api/v1/driver/pools/${poolId}/start`);
    const earlyDrop = await jashim.post(`/api/v1/driver/pools/${poolId}/riders/${rideId}/drop-off`);
    await jashim.post(`/api/v1/driver/pools/${poolId}/arrive`);
    const arriveAgain = await jashim.post(`/api/v1/driver/pools/${poolId}/arrive`);

    for (const res of [earlyStart, earlyDrop, arriveAgain]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    }
    expect(earlyStart.body.error.message).toBe('A pool cannot go from ACCEPTED to STARTED');
  });

  it('closes the pool to newcomers once Jashim has arrived', async () => {
    const { jashim, poolId } = await poolWithNusrat();
    await jashim.post(`/api/v1/driver/pools/${poolId}/arrive`);

    const late = await request(await signedInAs(app, 'shirin'), 'mohakhali');

    expect(late.status).toBe('REQUESTED');
  });

  it('keeps Jashim online and in his zone while a pool is under way', async () => {
    const { jashim } = await poolWithNusrat();

    const res = await jashim
      .patch('/api/v1/driver/status')
      .send({ isOnline: false, currentZoneId: zoneIdOf('banani') });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_POOL_EXISTS');
  });

  it('puts passengers back in the queue, free of charge, when Jashim cancels the pool', async () => {
    const { jashim, nusrat, poolId, rideId } = await poolWithNusrat();

    const res = await jashim.post(`/api/v1/driver/pools/${poolId}/cancel`);

    expect(res.body.pool).toBeNull();
    expect((await nusrat.get(`/api/v1/rides/${rideId}`)).body.ride).toMatchObject({
      status: 'REQUESTED',
      pool: null,
      cancellationFeePoisha: 0,
    });
    const [membership] = await db
      .select()
      .from(poolMemberships)
      .where(eq(poolMemberships.rideRequestId, rideId));
    expect(membership).toMatchObject({ leftReason: 'DRIVER_CANCELLED' }); // history kept
    expect((await expectPoolConsistent(poolId)).seatsTaken).toBe(0);
    expect((await jashim.get('/api/v1/driver/requests')).body.requests).toHaveLength(1);
  });
});

describe('driver access control', () => {
  it('keeps passengers out of driver endpoints', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    expect((await nusrat.get('/api/v1/driver/pool')).status).toBe(403);
  });

  it("does not let another driver touch Jashim's pool", async () => {
    const jashim = await jashimOnlineAtBanani();
    const ride = await request(await signedInAs(app, 'nusrat'), 'mohakhali');
    const poolId = (await jashim.post(`/api/v1/driver/requests/${ride.id}/accept`)).body.pool.id;
    const karim = await secondDriverSignedIn();

    const res = await karim.post(`/api/v1/driver/pools/${poolId}/cancel`);

    expect(res.status).toBe(404); // not "403": Karim cannot even learn the pool exists
    expect((await jashim.get('/api/v1/driver/pool')).body.pool.status).toBe('ACCEPTED');
  });
});
