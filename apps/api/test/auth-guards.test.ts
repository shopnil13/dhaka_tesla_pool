import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authOf, requireAuth, requireRole } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/errorHandler';
import { SESSION_COOKIE, signSession } from '../src/lib/session';

// A tiny app with one driver-only route, so the guards are tested in
// isolation from any real feature.
const app = express();
app.use(cookieParser());
app.get('/driver-only', requireAuth, requireRole('DRIVER'), (req, res) => {
  res.json({ userId: authOf(req).userId });
});
app.use(errorHandler);

const cookieFor = (role: 'DRIVER' | 'PASSENGER') =>
  `${SESSION_COOKIE}=${signSession({ userId: '00000000-0000-4000-8000-000000000001', role })}`;

describe('requireAuth + requireRole', () => {
  it('lets Jashim (DRIVER) through', async () => {
    const res = await request(app).get('/driver-only').set('Cookie', cookieFor('DRIVER'));

    expect(res.status).toBe(200);
  });

  it('stops Nusrat (PASSENGER) with 403, not 401: she is signed in, just not allowed', async () => {
    const res = await request(app).get('/driver-only').set('Cookie', cookieFor('PASSENGER'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('stops anonymous callers with 401', async () => {
    const res = await request(app).get('/driver-only');

    expect(res.status).toBe(401);
  });
});
