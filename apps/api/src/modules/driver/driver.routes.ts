import { driverStatusSchema, type DriverStatusInput } from '@teslapool/shared';
import { Router, type Request } from 'express';
import { authOf, requireAuth, requireRole } from '../../middleware/auth';
import { idParam } from '../../middleware/params';
import { validateBody } from '../../middleware/validate';
import {
  getCurrentPool,
  getDriverFeed,
  getDriverHistory,
  getDriverProfile,
} from './driver.queries';
import {
  acceptRequest,
  cancelPool,
  dropOff,
  markArrived,
  startTrip,
  updateDriverStatus,
} from './driver.service';

/**
 * Driver endpoints. Lifecycle changes are explicit commands (POST .../arrive)
 * rather than PATCH {status}: each has its own rules, side effects (fares are
 * frozen on start) and audit entry. Commands answer with the updated pool.
 */
export const driverRouter = Router();

driverRouter.use('/driver', requireAuth, requireRole('DRIVER'));

const driverId = (req: Request) => authOf(req).userId;
const poolId = (req: Request) => idParam(req.params.poolId, 'Pool');

driverRouter.get('/driver/profile', async (req, res) => {
  res.json({ driver: await getDriverProfile(driverId(req)) });
});

driverRouter.patch('/driver/status', validateBody(driverStatusSchema), async (req, res) => {
  await updateDriverStatus(driverId(req), req.body as DriverStatusInput);
  res.json({ driver: await getDriverProfile(driverId(req)) });
});

driverRouter.get('/driver/requests', async (req, res) => {
  res.json({ requests: await getDriverFeed(driverId(req)) });
});

driverRouter.post('/driver/requests/:rideId/accept', async (req, res) => {
  await acceptRequest(driverId(req), idParam(req.params.rideId, 'Request'));
  res.json({ pool: await getCurrentPool(driverId(req)) });
});

driverRouter.get('/driver/pool', async (req, res) => {
  res.json({ pool: await getCurrentPool(driverId(req)) });
});

driverRouter.get('/driver/history', async (req, res) => {
  res.json({ history: await getDriverHistory(driverId(req)) });
});

driverRouter.post('/driver/pools/:poolId/arrive', async (req, res) => {
  await markArrived(driverId(req), poolId(req));
  res.json({ pool: await getCurrentPool(driverId(req)) });
});

driverRouter.post('/driver/pools/:poolId/start', async (req, res) => {
  await startTrip(driverId(req), poolId(req));
  res.json({ pool: await getCurrentPool(driverId(req)) });
});

driverRouter.post('/driver/pools/:poolId/riders/:rideId/drop-off', async (req, res) => {
  await dropOff(driverId(req), poolId(req), idParam(req.params.rideId, 'Ride'));
  res.json({ pool: await getCurrentPool(driverId(req)) });
});

driverRouter.post('/driver/pools/:poolId/cancel', async (req, res) => {
  await cancelPool(driverId(req), poolId(req));
  res.json({ pool: await getCurrentPool(driverId(req)) });
});
