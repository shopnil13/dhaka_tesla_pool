import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { pgPool } from '../src/db/client';

const app = createApp();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/health', () => {
  it('reports that the API and database are up', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('returns 503 when the database is unreachable, so orchestrators stop routing to it', async () => {
    vi.spyOn(pgPool, 'query').mockRejectedValueOnce(new Error('connect ECONNREFUSED') as never);

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('reuses a safe incoming request id and echoes it back', async () => {
    const res = await request(app).get('/api/v1/health').set('x-request-id', 'bullet-8-41');

    expect(res.headers['x-request-id']).toBe('bullet-8-41');
  });
});

describe('error envelope', () => {
  it('returns NOT_FOUND for unknown routes, tagged with the request id', async () => {
    const res = await request(app).get('/api/v1/teleport');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects malformed JSON as a validation error instead of a 500', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('content-type', 'application/json')
      .send('{"seats": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
