import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
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
 *
 * - by: 'account' keys on the email being signed into. That is what stops
 *   brute-forcing a password, and it still works behind a proxy that does not
 *   forward the client IP (Next.js rewrites do not send X-Forwarded-For).
 * - by: 'ip' keys on the client IP (sign-up spam).
 */
export const createAuthRateLimit = ({ by }: { by: 'account' | 'ip' }) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.AUTH_RATE_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email: unknown = req.body?.email;
      if (by === 'account' && typeof email === 'string') {
        return `account:${email.trim().toLowerCase()}`;
      }
      return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    },
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
