'use client';

import type { RideStatus, TimelineKind } from '@teslapool/shared';
import { LoadError } from '@/components/load-error';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDhakaClock } from '@/lib/format';
import { useRideTimeline } from '@/lib/rides';
import { cn } from '@/lib/utils';

const MARKER_COLOUR: Record<TimelineKind, string> = {
  REQUESTED: 'bg-muted-foreground',
  MATCHED: 'bg-primary',
  REQUEUED: 'bg-amber-500',
  DRIVER_ARRIVED: 'bg-primary',
  STARTED: 'bg-primary',
  COMPLETED: 'bg-emerald-600',
  CANCELLED: 'bg-destructive',
  OTHER: 'bg-muted-foreground',
};

/** Everything that happened to the ride, oldest first, in the words the API chose. */
export function RideTimeline({ rideId, status }: { rideId: string; status: RideStatus }) {
  const timeline = useRideTimeline(rideId, status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {timeline.error ? (
          <LoadError message={timeline.error.message} onRetry={() => timeline.refetch()} />
        ) : !timeline.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ol className="grid" aria-label="What happened">
            {timeline.data.map((entry, index) => (
              <li key={entry.id} className="grid grid-cols-[0.75rem_1fr] gap-x-3">
                <span className="flex flex-col items-center" aria-hidden>
                  <span className={cn('mt-1.5 size-2.5 rounded-full', MARKER_COLOUR[entry.kind])} />
                  {index < timeline.data.length - 1 && <span className="w-px flex-1 bg-border" />}
                </span>
                <div className="grid gap-0.5 pb-4">
                  <p className="text-sm font-medium">{entry.title}</p>
                  {entry.detail && <p className="text-sm text-muted-foreground">{entry.detail}</p>}
                  <time dateTime={entry.at} className="text-xs text-muted-foreground">
                    {formatDhakaClock(entry.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
