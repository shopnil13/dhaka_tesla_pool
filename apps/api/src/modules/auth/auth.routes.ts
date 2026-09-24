import { registerSchema, type RegisterInput } from '@teslapool/shared';
import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { registerPassenger } from './auth.service';

export const authRouter = Router();

authRouter.post('/auth/register', validateBody(registerSchema), async (req, res) => {
  const user = await registerPassenger(req.body as RegisterInput);
  res.status(201).json({ user });
});
