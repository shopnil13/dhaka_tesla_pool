'use client';

import type { DriverHistory, DriverHistoryRider, DriverPastPool } from '@teslapool/shared';
import { LoadError } from '@/components/load-error';
import { AverageRating, StarRating } from '@/components/star-rating';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDriverHistory } from '@/lib/driver';
import { formatDhakaTime, formatTaka } from '@/lib/format';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-semibold">{children}</dd>
    </div>
  );
}

function Totals({ summary }: { summary: DriverHistory['summary'] }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>All finished trips</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Earned">{formatTaka(summary.earningsPoisha)}</Stat>
          <Stat label="Trips">{summary.completedTrips}</Stat>
          <Stat label="Riders carried">{summary.ridersCarried}</Stat>
          <Stat label="Rating">{summary.rating ? <AverageRating {...summary.rating} /> : '—'}</Stat>
        </dl>
      </CardContent>
    </Card>
  );
}

/** How the booking ended and what it paid the driver. */
function outcomeLine(rider: DriverHistoryRider) {
  const how = rider.paymentMethod === 'TESLAPAY' ? 'TeslaPay' : 'cash';
  switch (rider.outcome) {
    case 'DROPPED_OFF':
      return `Dropped off · ${formatTaka(rider.amountPoisha)} ${how}`;
    case 'PASSENGER_CANCELLED':
      return rider.amountPoisha > 0
        ? `Cancelled late · ${formatTaka(rider.amountPoisha)} fee`
        : 'Cancelled before you arrived';
    case 'DRIVER_CANCELLED':
      return 'You cancelled · back in the queue';
  }
}

function PastPoolCard({ pool }: { pool: DriverPastPool }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{formatDhakaTime(pool.acceptedAt)}</CardDescription>
        <CardTitle>
          From {pool.pickupZone} · {pool.isShared ? 'shared' : 'solo'}
        </CardTitle>
        <CardAction className="grid justify-items-end gap-1">
          <Badge variant={pool.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
            {pool.status === 'CANCELLED' ? 'Cancelled' : 'Completed'}
          </Badge>
          <span className="text-sm font-medium">{formatTaka(pool.earningsPoisha)}</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {pool.riders.map((rider) => (
            <li
              key={`${pool.id}:${rider.rideRequestId}`}
              className="grid gap-1 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {rider.passengerName} → {rider.dropoffZone}
                  {rider.seats > 1 ? ` · ${rider.seats} seats` : ''}
                </p>
                {rider.rating && <StarRating stars={rider.rating.stars} />}
              </div>
              <p className="text-sm text-muted-foreground">{outcomeLine(rider)}</p>
              {rider.rating?.comment && <p className="text-sm">“{rider.rating.comment}”</p>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Finished trips, newest first, with who rode, what each paid and how they rated it. */
export function DriverHistoryView() {
  const history = useDriverHistory();

  if (history.error) {
    return <LoadError message={history.error.message} onRetry={() => history.refetch()} />;
  }
  if (!history.data) return <Skeleton className="h-96 w-full" />;
  const { summary, pools } = history.data;

  return (
    <>
      <Totals summary={summary} />
      {pools.length === 0 ? (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          No finished trips yet. They appear here once the last passenger is dropped off.
        </p>
      ) : (
        pools.map((pool) => <PastPoolCard key={pool.id} pool={pool} />)
      )}
    </>
  );
}
