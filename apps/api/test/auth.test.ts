import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { users, walletAccounts } from '../src/db/schema';
import { resetDatabase } from './support/db';

const app = createApp();

beforeEach(resetDatabase);

describe('POST /api/v1/auth/register', () => {
  const shirinsCousin = {
    name: 'Tania',
    email: ' Tania@TeslaPool.test ',
    password: 'banani-rd-11',
  };

  it('signs up a passenger with an empty TeslaPay wallet', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(shirinsCousin);

    expect(res.status).toBe(201);
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
