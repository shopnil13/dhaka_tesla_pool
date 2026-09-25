import { Router } from 'express';
import { loadZoneMap } from './zones.service';

export const zonesRouter = Router();

// Public reference data: the list of Dhaka areas a ride can start or end in.
zonesRouter.get('/zones', async (_req, res) => {
  const { zones } = await loadZoneMap();
  res.json({ zones });
});
