import type { FareBreakdown, PassengerRide, PaymentView } from '@teslapool/shared';
import { AverageRating } from '@/components/star-rating';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDhakaTime, formatKm, formatTaka } from '@/lib/format';
import { RIDE_STATUS_LABELS, stageHeadline } from '@/lib/ride-status';
import { Detail } from './active-ride-card';

/** The fare frozen at the start, line by line, so it can be checked by hand. */
function FareLines({ fare }: { fare: FareBreakdown }) {
  const lines: [string, string][] = [
    ['Base fare', formatTaka(fare.baseFarePoisha)],
    [`Distance (${formatKm(fare.distanceM)})`, formatTaka(fare.distanceChargePoisha)],
  ];
  if (fare.seats > 1) lines.push([`× ${fare.seats} seats`, formatTaka(fare.subtotalPoisha)]);
  if (fare.discountPoisha > 0) {
    const riders = fare.riders ? `, ${fare.riders} bookings` : '';
    lines.push([
      `Share discount (${fare.discountPct}%${riders})`,
      `−${formatTaka(fare.discountPoisha)}`,
    ]);
  }
  return (
    <dl className="grid gap-1.5 rounded-lg bg-muted p-4 text-sm">
      {lines.map(([term, amount]) => (
        <div key={term} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{amount}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1.5 font-medium">
        <dt>Your fare</dt>
        <dd>{formatTaka(fare.totalPoisha)}</dd>
      </div>
    </dl>
  );
}

const PURPOSE_LABELS: Record<PaymentView['purpose'], string> = {
  FARE: 'Fare',
  CANCELLATION_FEE: 'Late cancellation fee',
};

function paymentLine(payment: PaymentView) {
  const how = payment.method === 'TESLAPAY' ? 'TeslaPay' : 'cash';
  return payment.status === 'PAID'
    ? `${PURPOSE_LABELS[payment.purpose]}: ${formatTaka(payment.amountPoisha)} paid (${how})`
    : `${PURPOSE_LABELS[payment.purpose]}: ${formatTaka(payment.amountPoisha)} due with your next ride`;
}

/** A ride that is over: what it was, who drove, and exactly what was charged. */
export function PastRideCard({ ride }: { ride: PassengerRide }) {
  const { pool } = ride;
  const charged =
    ride.status === 'COMPLETED' && ride.finalFarePoisha !== null
      ? formatTaka(ride.finalFarePoisha)
      : ride.cancellationFeePoisha > 0
        ? `${formatTaka(ride.cancellationFeePoisha)} late fee`
        : 'No charge';

  return (
    <Card>
      <CardHeader>
        <CardDescription>{formatDhakaTime(ride.requestedAt)}</CardDescription>
        <CardTitle className="text-xl">{stageHeadline(ride)}</CardTitle>
        <CardAction>
          <Badge variant={ride.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
            {RIDE_STATUS_LABELS[ride.status]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail term="Trip">
            {ride.pickupZone.name} → {ride.dropoffZone.name}
          </Detail>
          <Detail term="Seats">
            {ride.seats} · {ride.wantsShare ? 'shared' : 'solo'}
          </Detail>
          <Detail term="Charged">{charged}</Detail>
          <Detail term="Payment">{ride.paymentMethod === 'TESLAPAY' ? 'TeslaPay' : 'Cash'}</Detail>
        </dl>

        {pool && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
            <p className="font-medium">
              {pool.driverName} · {pool.vehicle.name}
            </p>
            {pool.driverRating && <AverageRating {...pool.driverRating} />}
          </div>
        )}

        {ride.fareBreakdown && <FareLines fare={ride.fareBreakdown} />}

        {ride.payments.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {ride.payments.map((payment, index) => (
              <li key={index}>{paymentLine(payment)}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
