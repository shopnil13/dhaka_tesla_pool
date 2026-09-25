import { z } from 'zod';
import { NotFoundError } from '../lib/errors';

const uuid = z.uuid();

/**
 * Route ids are UUIDs. Anything else cannot exist, so it is a 404 — and it
 * never reaches Postgres, which would otherwise fail with a 500 on a bad uuid.
 */
export function idParam(value: string | string[] | undefined, what = 'Resource'): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new NotFoundError(`${what} not found`);
  return parsed.data;
}
