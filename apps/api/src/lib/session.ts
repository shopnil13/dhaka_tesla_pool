import { USER_ROLES, type UserRole } from '@teslapool/shared';
import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const SESSION_COOKIE = 'tp_session';

/** What a valid session token proves: who the caller is and in which role. */
export interface Session {
  userId: string;
  role: UserRole;
}

const cookieOptions: CookieOptions = {
  httpOnly: true, // unreadable from JavaScript, so XSS cannot steal it
  sameSite: 'lax', // not sent on cross-site POSTs, which blocks CSRF
  secure: env.COOKIE_SECURE,
  path: '/',
};

const isUserRole = (value: unknown): value is UserRole => USER_ROLES.includes(value as UserRole);

export function signSession(session: Session): string {
  return jwt.sign({ role: session.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: session.userId,
    expiresIn: env.JWT_EXPIRES_IN_HOURS * 3600,
  });
}

/** Returns null for anything that is not a valid, unexpired token we signed. */
export function verifySession(token: string): Session | null {
  try {
    // Pinning the algorithm stops "alg: none" and algorithm-swap tokens.
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub || !isUserRole(payload.role)) return null;
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, session: Session) {
  res.cookie(SESSION_COOKIE, signSession(session), {
    ...cookieOptions,
    maxAge: env.JWT_EXPIRES_IN_HOURS * 3600 * 1000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
