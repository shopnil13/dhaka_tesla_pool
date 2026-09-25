import type { UserRole } from '@teslapool/shared';
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { SESSION_COOKIE, verifySession, type Session } from '../lib/session';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: Session;
  }
}

/** 401 unless the request carries a valid session cookie. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  req.auth = session;
  next();
};

/** 403 unless the signed-in user has the given role. Use after requireAuth. */
export const requireRole =
  (role: UserRole): RequestHandler =>
  (req, _res, next) => {
    if (req.auth?.role !== role) {
      throw new AppError(403, 'FORBIDDEN', `Only ${role.toLowerCase()}s can do this`);
    }
    next();
  };

/** The session of a request that has passed requireAuth. */
export function authOf(req: Request): Session {
  if (!req.auth) throw new Error('authOf() used on a route without requireAuth');
  return req.auth;
}
