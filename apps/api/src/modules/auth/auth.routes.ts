import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '@teslapool/shared';
import { Router } from 'express';
import { authOf, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { clearSessionCookie, setSessionCookie } from '../../lib/session';
import { getUser, login, registerPassenger } from './auth.service';

export const authRouter = Router();

authRouter.post('/auth/register', validateBody(registerSchema), async (req, res) => {
  const user = await registerPassenger(req.body as RegisterInput);
  setSessionCookie(res, { userId: user.id, role: user.role });
  res.status(201).json({ user });
});

authRouter.post('/auth/login', validateBody(loginSchema), async (req, res) => {
  const user = await login(req.body as LoginInput);
  setSessionCookie(res, { userId: user.id, role: user.role });
  res.json({ user });
});

// Idempotent and open to everyone: logging out twice is not an error.
authRouter.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/auth/me', requireAuth, async (req, res) => {
  const user = await getUser(authOf(req).userId);
  res.json({ user });
});
