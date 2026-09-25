'use client';

import Link from 'next/link';
import { LoadError } from '@/components/load-error';
import { StarRating } from '@/components/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDhakaTime, formatTaka } from '@/lib/format';
import { RIDE_STATUS_LABELS } from '@/lib/ride-status';
import { useRideHistory } from '@/lib/rides';

/** Every ride the passenger has taken or booked, newest first; each opens its own page. */
export function RideHistory() {
  const history = useRideHistory();

  if (history.error) {
    return <LoadError message={history.error.message} onRetry={() => history.refetch()} />;
  }
  if (!history.data) return <Skeleton className="h-64 w-full" />;
  if (history.data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No rides yet</CardTitle>
          <CardDescription>Your trips, fares and ratings will show up here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/passenger">Book a ride</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your rides</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {history.data.map((ride) => (
            <li key={ride.id}>
              <Link
                href={`/passenger/rides/${ride.id}`}
                className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 hover:bg-muted/50"
              >
                <div className="grid gap-0.5">
                  <p className="text-sm font-medium">
                    {ride.pickupZone} → {ride.dropoffZone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDhakaTime(ride.requestedAt)}
                    {ride.driverName ? ` · with ${ride.driverName}` : ''}
                  </p>
                </div>
                <div className="grid justify-items-end gap-1">
                  {ride.status !== 'CANCELLED' && (
                    <p className="text-sm font-medium">{formatTaka(ride.farePoisha)}</p>
                  )}
                  {ride.stars !== null ? (
                    <StarRating stars={ride.stars} />
                  ) : ride.status === 'COMPLETED' ? (
                    <Badge>Rate</Badge>
                  ) : (
                    <Badge variant={ride.status === 'CANCELLED' ? 'destructive' : 'outline'}>
                      {RIDE_STATUS_LABELS[ride.status]}
                    </Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
