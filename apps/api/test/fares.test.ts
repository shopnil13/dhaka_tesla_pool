import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { zoneIdOf } from './support/zones';

const app = createApp();

beforeEach(resetDatabase);

const nusratsTrip = {
  pickupZoneId: zoneIdOf('banani'),
  dropoffZoneId: zoneIdOf('mohakhali'),
  seats: 1,
  wantsShare: true,
};

describe('GET /api/v1/zones', () => {
  it('lists the predefined Dhaka areas', async () => {
    const res = await request(app).get('/api/v1/zones');

    expect(res.status).toBe(200);
    expect(res.body.zones).toHaveLength(9);
    expect(res.body.zones[0]).toEqual({ id: zoneIdOf('banani'), slug: 'banani', name: 'Banani' });
  });
});

describe('POST /api/v1/fares/estimate', () => {
  it('quotes Nusrat ৳72 for a shared ride to Mohakhali, dropping to ৳63 if Bullet fills up', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    const res = await nusrat.post('/api/v1/fares/estimate').send(nusratsTrip);

    expect(res.status).toBe(200);
    expect(res.body.estimate.distanceM).toBe(2500);
    expect(res.body.estimate.quote).toMatchObject({ subtotalPoisha: 9000, totalPoisha: 7200 });
    expect(res.body.estimate.bestCase.totalPoisha).toBe(6300);
  });

  it('quotes ৳90 with no best case for a solo ride', async () => {
    const nusrat = await signedInAs(app, 'nusrat');

    const res = await nusrat
      .post('/api/v1/fares/estimate')
      .send({ ...nusratsTrip, wantsShare: false });

    expect(res.body.estimate.quote.totalPoisha).toBe(9000);
    expect(res.body.estimate.bestCase).toBeNull();
  });

  it('rejects impossible trips with field-level messages', async () => {
    const nusrat = await signedInAs(app, 'nusrat');
    const estimate = (body: object) => nusrat.post('/api/v1/fares/estimate').send(body);

    const sameZone = await estimate({ ...nusratsTrip, dropoffZoneId: nusratsTrip.pickupZoneId });
    const sharedFullCar = await estimate({ ...nusratsTrip, seats: 3 });
    const unknownZone = await estimate({ ...nusratsTrip, dropoffZoneId: 999 });

    expect(sameZone.body.error.details.fieldErrors).toHaveProperty('dropoffZoneId');
    expect(sharedFullCar.body.error.details.fieldErrors.seats).toEqual([
      'A shared ride can book at most 2 seats',
    ]);
    expect(unknownZone.status).toBe(400);
    expect(unknownZone.body.error.details.fieldErrors).toEqual({ dropoffZoneId: ['Unknown zone'] });
  });

  it('is for passengers: Jashim gets 403 and anonymous callers 401', async () => {
    const jashim = await signedInAs(app, 'jashim');

    expect((await jashim.post('/api/v1/fares/estimate').send(nusratsTrip)).status).toBe(403);
    expect((await request(app).post('/api/v1/fares/estimate').send(nusratsTrip)).status).toBe(401);
  });
});
