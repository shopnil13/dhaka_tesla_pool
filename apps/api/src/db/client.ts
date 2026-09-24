import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

// Called pgPool (not "pool") so it is never confused with a ride pool.
export const pgPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle(pgPool, { schema });

export type Db = typeof db;
