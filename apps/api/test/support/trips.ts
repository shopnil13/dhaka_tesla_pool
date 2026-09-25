import type { Express } from 'express';
import type TestAgent from 'supertest/lib/agent';
import { expect } from 'vitest';
import { signedInAs } from './http';
import { fromBanani } from './rides';
import { zoneIdOf } from './zones';

type Agent = TestAgent;
type Destination = Parameters<typeof fromBanani>[0];

/** Jashim signed in and online at Banani, ready to accept. */
export async function jashimOnlineAtBanani(app: Express) {
  const jashim = await signedInAs(app, 'jashim');
  const res = await jashim
    .patch('/api/v1/driver/status')
    .send({ isOnline: true, currentZoneId: zoneIdOf('banani') });
  expect(res.status).toBe(200);
  return jashim;
}

/** A passenger requests a ride from Banani; returns the created ride. */
export async function requestFromBanani(passenger: Agent, to: Destination, extra: object = {}) {
  const res = await passenger.post('/api/v1/rides').send(fromBanani(to, extra));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.ride as { id: string; status: string };
}

/** Driver-side shortcuts for the pool lifecycle. */
export const poolCommands = (jashim: Agent) => ({
  accept: async (rideId: string) => {
    const res = await jashim.post(`/api/v1/driver/requests/${rideId}/accept`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.pool.id as string;
  },
  arrive: (poolId: string) => jashim.post(`/api/v1/driver/pools/${poolId}/arrive`),
  start: (poolId: string) => jashim.post(`/api/v1/driver/pools/${poolId}/start`),
  dropOff: (poolId: string, rideId: string) =>
    jashim.post(`/api/v1/driver/pools/${poolId}/riders/${rideId}/drop-off`),
});
