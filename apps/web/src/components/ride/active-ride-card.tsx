import type { PassengerRide } from '@teslapool/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKm, formatTaka, ordinal } from '@/lib/format';
import { rideStage, STAGE_STEPS, stageHeadline } from '@/lib/ride-status';
import { cn } from '@/lib/utils';

function StageStepper({ ride }: { ride: PassengerRide }) {
  const current = STAGE_STEPS.findIndex((step) => step.stage === rideStage(ride));
  return (
    <ol className="grid grid-cols-5 gap-1 text-center text-xs" aria-label="Ride progress">
      {STAGE_STEPS.map((step, index) => (
        <li
          key={step.stage}
          aria-current={index === current ? 'step' : undefined}
          className="grid gap-1.5"
        >
          <span
            className={cn('h-1.5 rounded-full', index <= current ? 'bg-primary' : 'bg-muted')}
          />
          <span className={index === current ? 'font-medium' : 'text-muted-foreground'}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/** The passenger's current ride: where it is, what it costs, who is driving. */
export function ActiveRideCard({ ride }: { ride: PassengerRide }) {
  const { pool } = ride;
  const fare = ride.finalFarePoisha ?? ride.quotedFarePoisha;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Your ride</CardDescription>
        <CardTitle className="text-xl">{stageHeadline(ride)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <StageStepper ride={ride} />

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail term="Trip">
            {ride.pickupZone.name} → {ride.dropoffZone.name}
          </Detail>
          <Detail term="Distance">{formatKm(ride.distanceM)}</Detail>
          <Detail term="Seats">
            {ride.seats} · {ride.wantsShare ? 'shared' : 'solo'}
          </Detail>
          <Detail term={ride.finalFarePoisha ? 'Final fare' : 'Upfront fare'}>
            {formatTaka(fare)} · {ride.paymentMethod === 'TESLAPAY' ? 'TeslaPay' : 'Cash'}
          </Detail>
        </dl>

        {pool ? (
          <div className="grid gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {pool.driverName} · {pool.vehicle.name}
              </p>
              <Badge variant="outline">{pool.vehicle.plate}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {pool.seatsTaken} of {pool.vehicle.capacity} seats taken ·{' '}
              {pool.coRiders === 0
                ? 'no one else aboard yet'
                : `sharing with ${pool.coRiders} other ${pool.coRiders === 1 ? 'booking' : 'bookings'}`}
              {pool.dropoffOrder ? ` · you are the ${ordinal(pool.dropoffOrder)} stop` : ''}
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            {ride.wantsShare
              ? `We'll seat you in the next Tesla leaving ${ride.pickupZone.name} that goes your way. Drivers nearby can see your request.`
              : `Drivers near ${ride.pickupZone.name} can see your request.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
