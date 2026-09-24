import { describe, expect, it } from 'vitest';
import { DISTANCES_KM, ZONES, type ZoneSlug } from '../src/db/seed-data/zones';

const key = (a: ZoneSlug, b: ZoneSlug) => [a, b].sort().join('|');
const distances = new Map(DISTANCES_KM.map(([a, b, km]) => [key(a, b), km]));
const distance = (a: ZoneSlug, b: ZoneSlug) => (a === b ? 0 : distances.get(key(a, b)));
const slugs = ZONES.map((z) => z.slug);

describe('zone distance matrix', () => {
  it('has exactly one positive distance for every pair of zones', () => {
    const pairCount = (slugs.length * (slugs.length - 1)) / 2;

    expect(DISTANCES_KM).toHaveLength(pairCount);
    expect(distances.size).toBe(pairCount);
    for (const [, , km] of DISTANCES_KM) expect(km).toBeGreaterThan(0);
  });

  it('obeys the triangle inequality, so a detour can never be negative', () => {
    for (const a of slugs)
      for (const b of slugs)
        for (const c of slugs) {
          const direct = distance(a, c)!;
          const viaB = distance(a, b)! + distance(b, c)!;
          expect(direct, `${a} → ${c} via ${b}`).toBeLessThanOrEqual(viaB);
        }
  });

  it("keeps the story's trips hand-checkable", () => {
    expect(distance('banani', 'mohakhali')).toBe(2.5); // Nusrat
    expect(distance('banani', 'gulshan-1')).toBe(3.0); // Rafiq
    expect(distance('mohakhali', 'gulshan-1')).toBe(2.0);
  });
});
