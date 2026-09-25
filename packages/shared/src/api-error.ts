/**
 * Every API error uses the same envelope so the web app can handle
 * failures in one place. Feature-specific codes (e.g. POOL_FULL) are
 * added alongside the features that raise them.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNSUPPORTED_MEDIA_TYPE',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'EMAIL_TAKEN',
  'INVALID_TRANSITION',
  'ACTIVE_RIDE_EXISTS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
