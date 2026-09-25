import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { fromBanani } from './support/rides';

const app = createApp();

beforeEach(resetDatabase);

describe('TeslaPay wallet', () => {
  it("shows Nusrat's ৳500 balance and the opening top-up in her ledger", async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    const { wallet } = (await nusrat.get('/api/v1/wallet')).body;

    expect(wallet).toMatchObject({ balancePoisha: 50_000, duesPoisha: 0, dues: [] });
    expect(wallet.transactions).toMatchObject([
      { type: 'TOPUP', amountPoisha: 50_000, balanceAfterPoisha: 50_000, description: 'Top-up' },
    ]);
  });

  it('records a simulated top-up in the ledger', async () => {
    const shirin = await signedInAs(app, 'shirin');

    const res = await shirin.post('/api/v1/wallet/top-up').send({ amountPoisha: 10_000 });

    expect(res.body.wallet.balancePoisha).toBe(15_000);
    expect(res.body.wallet.transactions[0]).toMatchObject({
      amountPoisha: 10_000,
      balanceAfterPoisha: 15_000,
    });
  });

  it('only accepts whole taka between ৳1 and ৳2000', async () => {
    const shirin = await signedInAs(app, 'shirin');

    for (const amountPoisha of [0, 50, 10_050, 250_000]) {
      const res = await shirin.post('/api/v1/wallet/top-up').send({ amountPoisha });
      expect(res.status, `${amountPoisha} poisha`).toBe(400);
    }
  });

  it('is for passengers only', async () => {
    const jashim = await signedInAs(app, 'jashim');

    expect((await jashim.get('/api/v1/wallet')).status).toBe(403);
    expect((await request(app).get('/api/v1/wallet')).status).toBe(401);
  });
});

describe('paying with TeslaPay', () => {
  it('stops Shirin (৳50) from booking a ৳72 ride on TeslaPay, but cash works', async () => {
    const shirin = await signedInAs(app, 'shirin');

    const teslaPay = await shirin
      .post('/api/v1/rides')
      .send(fromBanani('mohakhali', { paymentMethod: 'TESLAPAY' }));
    expect(teslaPay.status).toBe(422);
    expect(teslaPay.body.error).toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your TeslaPay balance is ৳50 but this ride needs ৳72. Top up or pay cash.',
      details: { balancePoisha: 5_000, neededPoisha: 7_200 },
    });

    const cash = await shirin.post('/api/v1/rides').send(fromBanani('mohakhali'));
    expect(cash.status).toBe(201);
  });

  it('lets Shirin pay with TeslaPay after topping up', async () => {
    const shirin = await signedInAs(app, 'shirin');
    await shirin.post('/api/v1/wallet/top-up').send({ amountPoisha: 10_000 });

    const res = await shirin
      .post('/api/v1/rides')
      .send(fromBanani('mohakhali', { paymentMethod: 'TESLAPAY' }));

    expect(res.status).toBe(201);
  });
});
