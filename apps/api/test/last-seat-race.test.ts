import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetDatabase } from './support/db';
import { signedInAs } from './support/http';
import { expectPoolConsistent, jashimsPoolWith } from './support/pools';
import { fromBanani } from './support/rides';

/**
 * The concurrency problem from the brief: Bullet has one seat left, and
 * Nusrat and Shirin both try to claim it at nearly the same instant, both
 * having seen one seat available.
 *
 * Mutation check: with the FOR UPDATE removed from lockPool, this fails in the
 * first round with [500, 201] — both requests pass the check, and the second
 * seat increment is stopped only by CHECK (seats_taken <= capacity). With the
 * lock, the second request waits, re-reads 3/3 and keeps waiting (REQUESTED).
 */

const app = createApp();

beforeEach(resetDatabase);

describe("the last-seat race: Nusrat and Shirin grab Bullet's final seat at the same instant", () => {
  it('seats exactly one of them and never overbooks, 10 rounds in a row', async () => {
    for (let round = 1; round <= 10; round++) {
      await resetDatabase();
      // Rafiq and a colleague already hold 2 of Bullet's 3 seats.
      const pool = await jashimsPoolWith([{ passenger: 'rafiq', to: 'gulshan-1', seats: 2 }]);
      const [nusrat, shirin] = await Promise.all([
        signedInAs(app, 'nusrat'),
        signedInAs(app, 'shirin'),
      ]);

      // Both see one seat free; both requests hit the API concurrently.
      const [a, b] = await Promise.all([
        nusrat.post('/api/v1/rides').send(fromBanani('mohakhali')),
        shirin.post('/api/v1/rides').send(fromBanani('mohakhali')),
      ]);

      expect([a.status, b.status], `round ${round}`).toEqual([201, 201]);
      expect([a.body.ride.status, b.body.ride.status].sort(), `round ${round}`).toEqual([
        'MATCHED',
        'REQUESTED', // the other one keeps waiting for the next Tesla
      ]);
      expect((await expectPoolConsistent(pool.id)).seatsTaken).toBe(3);
    }
  }, 60_000); // ten full rounds (reset, two logins, the race) take a few seconds
});
