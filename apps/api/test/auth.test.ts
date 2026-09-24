import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { users, walletAccounts } from '../src/db/schema';
import { SESSION_COOKIE } from '../src/lib/session';
import { resetDatabase, TEST_PASSWORD } from './support/db';

const sessionCookieOf = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));

const app = createApp();

beforeEach(resetDatabase);

describe('POST /api/v1/auth/register', () => {
  const shirinsCousin = {
    name: 'Tania',
    email: ' Tania@TeslaPool.test ',
    password: 'banani-rd-11',
  };

  it('signs up a passenger with an empty TeslaPay wallet and signs them in', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send(shirinsCousin);

    expect(res.status).toBe(201);
    expect((await agent.get('/api/v1/auth/me')).body.user.email).toBe('tania@teslapool.test');
    expect(res.body.user).toMatchObject({
      name: 'Tania',
      email: 'tania@teslapool.test', // trimmed and lower-cased
      role: 'PASSENGER',
    });
    const [wallet] = await db
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.userId, res.body.user.id));
    expect(wallet?.balancePoisha).toBe(0);
  });

  it('stores only a bcrypt hash, never the password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(shirinsCousin);

    const [user] = await db.select().from(users).where(eq(users.id, res.body.user.id));
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(user?.passwordHash).not.toContain(shirinsCousin.password);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it("refuses an email that is already taken, whatever its case (Nusrat's)", async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...shirinsCousin, email: 'NUSRAT@teslapool.test' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('explains which fields are invalid', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'T', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.details.fieldErrors).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs Nusrat in with an httpOnly, SameSite=Lax session cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nusrat@teslapool.test', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Nusrat', role: 'PASSENGER' });
    const cookie = sessionCookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('signs Jashim in as a driver through the same endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jashim@teslapool.test', password: TEST_PASSWORD });

    expect(res.body.user).toMatchObject({ name: 'Jashim', role: 'DRIVER' });
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nusrat@teslapool.test', password: 'not-her-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@teslapool.test', password: 'whatever-123' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Wrong email or password',
      });
      expect(sessionCookieOf(res)).toBeUndefined();
    }
  });
});

describe('session', () => {
  const secret = 'test-only-secret-that-is-at-least-32-chars';

  it('rejects /me without a session cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects forged tokens: tampered, wrong secret, alg none, expired', async () => {
    const [nusrat] = await db.select().from(users).where(eq(users.email, 'nusrat@teslapool.test'));
    const valid = jwt.sign({ role: 'PASSENGER' }, secret, { subject: nusrat!.id });
    const [header, , signature] = valid.split('.');
    const driverClaims = Buffer.from(JSON.stringify({ sub: nusrat!.id, role: 'DRIVER' })).toString(
      'base64url',
    );

    const forged = [
      `${header}.${driverClaims}.${signature}`, // payload edited to claim DRIVER
      jwt.sign({ role: 'PASSENGER' }, 'some-other-secret-that-is-32-chars-long', {
        subject: nusrat!.id,
      }),
      jwt.sign({ role: 'DRIVER' }, '', { subject: nusrat!.id, algorithm: 'none' }),
      jwt.sign({ role: 'PASSENGER' }, secret, { subject: nusrat!.id, expiresIn: -10 }),
    ];

    for (const token of forged) {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('ends the session on logout', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'rafiq@teslapool.test', password: TEST_PASSWORD });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);

    const res = await agent.post('/api/v1/auth/logout');

    expect(res.status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});
