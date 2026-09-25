import { formatTaka } from '@teslapool/shared';
import { describe, expect, it } from 'vitest';
import { finalFare, fullPoolFare, quoteFare } from '../../src/domain/fare';

// The numbers an evaluator can check with a pencil (see README → Fare model):
//   Nusrat  Banani → Mohakhali  2.5 km: (৳40 + 2.5 × ৳20) = ৳90
//   Rafiq   Banani → Gulshan 1  3.0 km: (৳40 + 3.0 × ৳20) = ৳100
const nusrat = { distanceM: 2500, seats: 1, wantsShare: true };
const rafiq = { distanceM: 3000, seats: 1, wantsShare: true };
const shirin = { distanceM: 2500, seats: 1, wantsShare: true };

const taka = (poisha: number) => formatTaka(poisha);

describe('quoteFare (shown before requesting)', () => {
  it('quotes Nusrat ৳72: ৳90 minus the 20% share discount', () => {
    const quote = quoteFare(nusrat);

    expect(quote).toMatchObject({
      baseFarePoisha: 4000,
      distanceChargePoisha: 5000,
      subtotalPoisha: 9000,
      discountPct: 20,
      discountPoisha: 1800,
      totalPoisha: 7200,
    });
    expect(taka(quote.totalPoisha)).toBe('৳72');
  });

  it('quotes Rafiq ৳80: ৳100 minus 20%', () => {
    expect(taka(quoteFare(rafiq).totalPoisha)).toBe('৳80');
  });

  it('charges the full ৳90 for a solo ride', () => {
    const solo = quoteFare({ ...nusrat, wantsShare: false });

    expect(solo).toMatchObject({ discountPct: 0, totalPoisha: 9000, riders: null });
  });

  it('charges per seat: Rafiq with a colleague pays for two seats', () => {
    expect(taka(quoteFare({ ...rafiq, seats: 2 }).totalPoisha)).toBe('৳160');
  });

  it('shows how low a shared fare can go if the pool fills up', () => {
    expect(taka(fullPoolFare(nusrat).totalPoisha)).toBe('৳63');
  });
});

describe('finalFare (frozen when the pool starts)', () => {
  it('keeps Nusrat ৳72 and Rafiq ৳80 when they share, as two riders', () => {
    expect(taka(finalFare(nusrat, 2, quoteFare(nusrat).totalPoisha).totalPoisha)).toBe('৳72');
    expect(taka(finalFare(rafiq, 2, quoteFare(rafiq).totalPoisha).totalPoisha)).toBe('৳80');
  });

  it('drops everyone to 30% off when Shirin takes the third seat: ৳63 / ৳70 / ৳63', () => {
    const fares = [nusrat, rafiq, shirin].map(
      (trip) => finalFare(trip, 3, quoteFare(trip).totalPoisha).totalPoisha,
    );

    expect(fares.map(taka)).toEqual(['৳63', '৳70', '৳63']);
  });

  it('honours the shared quote even if nobody else joins (one rider)', () => {
    const final = finalFare(nusrat, 1, quoteFare(nusrat).totalPoisha);

    expect(taka(final.totalPoisha)).toBe('৳72');
  });

  it('never exceeds the quote, whatever the rider count', () => {
    for (const trip of [nusrat, rafiq, { ...rafiq, seats: 2 }]) {
      const quoted = quoteFare(trip).totalPoisha;
      for (let riders = 1; riders <= 6; riders++) {
        expect(finalFare(trip, riders, quoted).totalPoisha).toBeLessThanOrEqual(quoted);
      }
    }
  });

  it('caps at the quote if a future rule would ever price higher', () => {
    const final = finalFare(nusrat, 2, 7000); // pretend the quote was lower

    expect(final.totalPoisha).toBe(7000);
    expect(final.subtotalPoisha - final.discountPoisha).toBe(7000);
  });

  it('stays solo-priced for a solo ride regardless of riders', () => {
    const solo = { ...nusrat, wantsShare: false };

    expect(finalFare(solo, 3, 9000).totalPoisha).toBe(9000);
  });
});

describe('guards', () => {
  it('rejects nonsense input instead of producing a fare', () => {
    expect(() => quoteFare({ ...nusrat, distanceM: 0 })).toThrow(RangeError);
    expect(() => quoteFare({ ...nusrat, distanceM: 2.5 })).toThrow(RangeError);
    expect(() => quoteFare({ ...nusrat, seats: 0 })).toThrow(RangeError);
  });

  it('formats poisha as taka', () => {
    expect(formatTaka(7200)).toBe('৳72');
    expect(formatTaka(7250)).toBe('৳72.50');
  });
});
