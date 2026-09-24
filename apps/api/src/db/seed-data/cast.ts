import type { ZoneSlug } from './zones';

/**
 * The story cast from the brief. Seed data, tests and the demo all use these
 * people so every scenario reads the same way everywhere.
 */
export const DRIVERS = [
  {
    name: 'Jashim',
    email: 'jashim@teslapool.test',
    startZone: 'banani' satisfies ZoneSlug,
    vehicle: { name: 'Bullet', plate: 'DHAKA-TESLA-11', capacity: 3 },
  },
] as const;

export const PASSENGERS = [
  // ৳500 — plenty for TeslaPay rides.
  { name: 'Nusrat', email: 'nusrat@teslapool.test', walletPoisha: 50_000 },
  // ৳300
  { name: 'Rafiq', email: 'rafiq@teslapool.test', walletPoisha: 30_000 },
  // ৳50 — deliberately too little for a ৳72 shared TeslaPay ride, so the
  // demo shows the insufficient-balance path (she can still pay cash).
  { name: 'Shirin', email: 'shirin@teslapool.test', walletPoisha: 5_000 },
] as const;
