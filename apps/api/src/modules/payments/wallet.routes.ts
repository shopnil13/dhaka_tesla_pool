import { topUpSchema, type TopUpInput } from '@teslapool/shared';
import { Router } from 'express';
import { authOf, requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { getWallet, topUp } from './wallet.service';

/** The passenger's simulated TeslaPay wallet. */
export const walletRouter = Router();

walletRouter.use('/wallet', requireAuth, requireRole('PASSENGER'));

walletRouter.get('/wallet', async (req, res) => {
  res.json({ wallet: await getWallet(authOf(req).userId) });
});

walletRouter.post('/wallet/top-up', validateBody(topUpSchema), async (req, res) => {
  res.json({ wallet: await topUp(authOf(req).userId, req.body as TopUpInput) });
});
