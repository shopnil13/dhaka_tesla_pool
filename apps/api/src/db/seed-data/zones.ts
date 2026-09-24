/**
 * Zones and the distance matrix the matching rule and fares are based on.
 * Distances are invented but plausible road distances in km, rounded to
 * 0.5 km so fares can be checked by hand. The matrix is symmetric and obeys
 * the triangle inequality (verified in test/zones-seed-data.test.ts).
 */
export const ZONES = [
  { slug: 'banani', name: 'Banani' },
  { slug: 'gulshan-1', name: 'Gulshan 1' },
  { slug: 'gulshan-2', name: 'Gulshan 2' },
  { slug: 'mohakhali', name: 'Mohakhali' },
  { slug: 'farmgate', name: 'Farmgate' },
  { slug: 'dhanmondi', name: 'Dhanmondi' },
  { slug: 'mirpur-10', name: 'Mirpur 10' },
  { slug: 'uttara', name: 'Uttara' },
  { slug: 'bashundhara', name: 'Bashundhara' },
] as const;

export type ZoneSlug = (typeof ZONES)[number]['slug'];

/** Each unordered pair appears once; the seed stores both directions. */
export const DISTANCES_KM: ReadonlyArray<readonly [ZoneSlug, ZoneSlug, number]> = [
  ['banani', 'gulshan-1', 3.0],
  ['banani', 'gulshan-2', 1.5],
  ['banani', 'mohakhali', 2.5],
  ['banani', 'farmgate', 6.0],
  ['banani', 'dhanmondi', 8.5],
  ['banani', 'mirpur-10', 6.5],
  ['banani', 'uttara', 11.0],
  ['banani', 'bashundhara', 6.0],
  ['gulshan-1', 'gulshan-2', 2.0],
  ['gulshan-1', 'mohakhali', 2.0],
  ['gulshan-1', 'farmgate', 5.0],
  ['gulshan-1', 'dhanmondi', 7.5],
  ['gulshan-1', 'mirpur-10', 8.5],
  ['gulshan-1', 'uttara', 13.5],
  ['gulshan-1', 'bashundhara', 7.0],
  ['gulshan-2', 'mohakhali', 3.5],
  ['gulshan-2', 'farmgate', 6.5],
  ['gulshan-2', 'dhanmondi', 9.0],
  ['gulshan-2', 'mirpur-10', 7.5],
  ['gulshan-2', 'uttara', 12.0],
  ['gulshan-2', 'bashundhara', 5.0],
  ['mohakhali', 'farmgate', 3.5],
  ['mohakhali', 'dhanmondi', 6.0],
  ['mohakhali', 'mirpur-10', 7.0],
  ['mohakhali', 'uttara', 13.5],
  ['mohakhali', 'bashundhara', 8.5],
  ['farmgate', 'dhanmondi', 3.0],
  ['farmgate', 'mirpur-10', 7.0],
  ['farmgate', 'uttara', 16.5],
  ['farmgate', 'bashundhara', 11.0],
  ['dhanmondi', 'mirpur-10', 8.0],
  ['dhanmondi', 'uttara', 19.0],
  ['dhanmondi', 'bashundhara', 13.5],
  ['mirpur-10', 'uttara', 11.5],
  ['mirpur-10', 'bashundhara', 11.5],
  ['uttara', 'bashundhara', 10.0],
];

export const kmToMetres = (km: number) => Math.round(km * 1000);
