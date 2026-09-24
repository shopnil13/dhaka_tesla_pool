import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from './support/db';

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

describe('auth rate limit', () => {
  it('blocks the 21st login attempt within 15 minutes', async () => {
    const app = createApp();
    const attempt = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nusrat@teslapool.test', password: 'guessing-123' });

    for (let i = 0; i < 20; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['ratelimit-policy']).toBeDefined();
  });
});
