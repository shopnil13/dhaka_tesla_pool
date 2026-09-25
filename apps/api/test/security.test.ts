import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase, TEST_PASSWORD } from './support/db';

beforeEach(resetDatabase);

describe('write requests must be JSON', () => {
  it('rejects a form-encoded login (what a cross-site HTML form would send)', async () => {
    const res = await request(createApp())
      .post('/api/v1/auth/login')
      .type('form')
      .send({ email: 'nusrat@teslapool.test', password: 'guess' });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('allows bodyless commands such as logout', async () => {
    const res = await request(createApp()).post('/api/v1/auth/logout');

    expect(res.status).toBe(204);
  });
});

describe('login rate limit', () => {
  it("locks guessing at Nusrat's password after 20 attempts, without locking out Rafiq", async () => {
    // Every request here comes from the same IP, just as all users do behind
    // the Next.js proxy, so this also proves the limit is per account.
    const app = createApp();
    const guess = (email: string) =>
      request(app).post('/api/v1/auth/login').send({ email, password: 'guessing-123' });

    for (let i = 0; i < 20; i++) expect((await guess('nusrat@teslapool.test')).status).toBe(401);
    const blocked = await guess('NUSRAT@teslapool.test'); // case does not dodge the limit
    const rafiq = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rafiq@teslapool.test', password: TEST_PASSWORD });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
    expect(rafiq.status).toBe(200);
  });
});
