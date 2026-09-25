import { rideRequestSchema, type RideRequestInput } from '@teslapool/shared';
import { Router } from 'express';
import { authOf, requireAuth, requireRole } from '../../middleware/auth';
import { idParam } from '../../middleware/params';
import { validateBody } from '../../middleware/validate';
import { getActiveRide, getPassengerRide, getRideTimeline, listRides } from './rides.queries';
import { cancelRide, requestRide } from './rides.service';

/** Passenger-facing ride endpoints. Every query is scoped to the caller. */
export const ridesRouter = Router();

ridesRouter.use('/rides', requireAuth, requireRole('PASSENGER'));

ridesRouter.post('/rides', validateBody(rideRequestSchema), async (req, res) => {
  const ride = await requestRide(authOf(req).userId, req.body as RideRequestInput);
  res.status(201).json({ ride });
});

ridesRouter.get('/rides', async (req, res) => {
  res.json({ rides: await listRides(authOf(req).userId) });
});

// Registered before /rides/:id so "active" is not mistaken for an id.
ridesRouter.get('/rides/active', async (req, res) => {
  res.json({ ride: await getActiveRide(authOf(req).userId) });
});

ridesRouter.get('/rides/:id', async (req, res) => {
  const ride = await getPassengerRide(authOf(req).userId, idParam(req.params.id, 'Ride'));
  res.json({ ride });
});

ridesRouter.get('/rides/:id/events', async (req, res) => {
  const events = await getRideTimeline(authOf(req).userId, idParam(req.params.id, 'Ride'));
  res.json({ events });
});

ridesRouter.post('/rides/:id/cancel', async (req, res) => {
  const ride = await cancelRide(authOf(req).userId, idParam(req.params.id, 'Ride'));
  res.json({ ride });
});
