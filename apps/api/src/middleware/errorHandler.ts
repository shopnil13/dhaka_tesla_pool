import type { ApiErrorBody } from '@teslapool/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { AppError, NotFoundError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}`));
};

/** Errors raised by express.json() (malformed JSON, body too large) carry a 4xx status. */
function isClientHttpError(err: unknown): err is { status: number; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);
  let status: number;
  let body: ApiErrorBody;

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details, requestId } };
  } else if (err instanceof ZodError) {
    // { formErrors, fieldErrors } maps straight onto form fields in the web app.
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid',
        details: z.flattenError(err),
        requestId,
      },
    };
  } else if (isClientHttpError(err)) {
    status = err.status;
    body = { error: { code: 'VALIDATION_FAILED', message: err.message, requestId } };
  } else {
    // Unexpected: log the details, but never leak them to the client.
    req.log.error({ err }, 'Unhandled error');
    status = 500;
    body = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId } };
  }

  res.status(status).json(body);
};
