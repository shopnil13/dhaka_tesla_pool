import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { TEST_PASSWORD } from './db';

export type CastMember = 'jashim' | 'nusrat' | 'rafiq' | 'shirin';

/** A Supertest agent that is signed in as one of the seeded cast. */
export async function signedInAs(app: Express, who: CastMember) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ email: `${who}@teslapool.test`, password: TEST_PASSWORD });
  expect(res.status, `login as ${who}`).toBe(200);
  return agent;
}
