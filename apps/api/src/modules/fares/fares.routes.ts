import { tripSchema, type TripInput } from '@teslapool/shared';
import { Router } from 'express';
import { fullPoolFare, quoteFare } from '../../domain/fare';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { assertKnownZones, loadZoneMap } from '../zones/zones.service';

export const faresRouter = Router();

/**
 * The upfront price for a trip, before requesting it. For a shared ride it
 * also returns the best case (a full pool), shown as "could drop to ...".
 */
faresRouter.post(
  '/fares/estimate',
  requireAuth,
  requireRole('PASSENGER'),
  validateBody(tripSchema),
  async (req, res) => {
    const trip = req.body as TripInput;
    const zoneMap = await loadZoneMap();
    assertKnownZones(zoneMap, {
      pickupZoneId: trip.pickupZoneId,
      dropoffZoneId: trip.dropoffZoneId,
    });

    const distanceM = zoneMap.distance(trip.pickupZoneId, trip.dropoffZoneId);
    const priced = { distanceM, seats: trip.seats, wantsShare: trip.wantsShare };
    res.json({
      estimate: {
        distanceM,
        quote: quoteFare(priced),
        bestCase: trip.wantsShare ? fullPoolFare(priced) : null,
      },
    });
  },
);
