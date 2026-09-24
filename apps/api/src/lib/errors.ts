import type { ErrorCode } from '@teslapool/shared';

/**
 * An expected, client-facing failure. Services throw these; the error
 * middleware turns them into the shared error envelope. Anything that is
 * not an AppError is treated as a bug and returned as a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}
