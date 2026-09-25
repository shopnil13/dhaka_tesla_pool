'use client';

import type { DriverFeedItem } from '@teslapool/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePoolCommand } from '@/lib/driver';
import { formatKm, formatTaka } from '@/lib/format';

interface RequestFeedProps {
  online: boolean;
  zoneName: string | undefined;
  requests: DriverFeedItem[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function RequestFeed({ online, zoneName, requests, isLoading, error }: RequestFeedProps) {
  const command = usePoolCommand();

  return (
    <Card>
      <CardHeader>
        <CardDescription>Requests</CardDescription>
        <CardTitle className="text-xl">
          {online ? `Waiting in ${zoneName}` : 'Go online to see requests'}
        </CardTitle>
      </CardHeader>
      {online && (
        <CardContent className="grid gap-2">
          {error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : isLoading || !requests ? (
            <Skeleton className="h-16 w-full" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one is waiting in {zoneName} right now.
            </p>
          ) : (
            <ul className="grid gap-2">
              {requests.map((item) => (
                <li
                  key={item.rideRequestId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="grid gap-0.5">
                    <p className="font-medium">
                      {item.passengerName} → {item.dropoffZone}{' '}
                      <Badge variant="outline">{item.wantsShare ? 'shared' : 'solo'}</Badge>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.seats} {item.seats === 1 ? 'seat' : 'seats'} ·{' '}
                      {formatKm(item.distanceM)} · {formatTaka(item.quotedFarePoisha)}
                    </p>
                    {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}
                  </div>
                  <Button
                    size="sm"
                    disabled={!item.canAccept || command.isPending}
                    onClick={() => command.mutate(`/driver/requests/${item.rideRequestId}/accept`)}
                  >
                    Accept
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
