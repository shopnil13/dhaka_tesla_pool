import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '@teslapool/shared';
import { Router } from 'express';
import { clearSessionCookie, setSessionCookie } from '../../lib/session';
import { authOf, requireAuth } from '../../middleware/auth';
import { createAuthRateLimit } from '../../middleware/security';
import { validateBody } from '../../middleware/validate';
import { getUser, login, registerPassenger } from './auth.service';

/** A factory so every app instance (and every test) gets its own rate limiter. */
export function createAuthRouter() {
  const router = Router();
  const signupRateLimit = createAuthRateLimit({ by: 'ip' });
  const loginRateLimit = createAuthRateLimit({ by: 'account' });

  router.post('/auth/register', signupRateLimit, validateBody(registerSchema), async (req, res) => {
    const user = await registerPassenger(req.body as RegisterInput);
    setSessionCookie(res, { userId: user.id, role: user.role });
    res.status(201).json({ user });
  });

  router.post('/auth/login', loginRateLimit, validateBody(loginSchema), async (req, res) => {
    const user = await login(req.body as LoginInput);
    setSessionCookie(res, { userId: user.id, role: user.role });
    res.json({ user });
  });

  // Idempotent and open to everyone: logging out twice is not an error.
  router.post('/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth, async (req, res) => {
    const user = await getUser(authOf(req).userId);
    res.json({ user });
  });

  return router;
}
