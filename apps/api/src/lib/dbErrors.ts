interface PgError {
  code?: string;
  constraint?: string;
}

/** Drizzle wraps driver errors (DrizzleQueryError); the pg error is its cause. */
export function pgErrorOf(err: unknown): PgError | undefined {
  const candidate = (err as { cause?: unknown } | null)?.cause ?? err;
  return typeof candidate === 'object' && candidate !== null && 'code' in candidate
    ? (candidate as PgError)
    : undefined;
}

/**
 * True when the write failed on the named unique constraint. Letting the
 * database decide (instead of "check, then insert") is race-free.
 */
export function isUniqueViolation(err: unknown, constraint: string) {
  const pgError = pgErrorOf(err);
  return pgError?.code === '23505' && pgError.constraint === constraint;
}
