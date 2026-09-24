import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Request bodies must be JSON. HTML forms can only send urlencoded, multipart
 * or text bodies, and a cross-site fetch with a JSON body needs a CORS
 * preflight this API never grants, so this closes the door on CSRF even if a
 * browser ever sent the session cookie cross-site.
 */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0');
  if (WRITE_METHODS.has(req.method) && hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request body as JSON');
  }
  next();
};

/**
 * Slows down password guessing and sign-up spam. One limiter per app
 * instance (in memory); several API instances would need a shared store.
 */
export const createAuthRateLimit = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.AUTH_RATE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Too many attempts. Please wait a few minutes and try again.',
        ),
      );
    },
  });
