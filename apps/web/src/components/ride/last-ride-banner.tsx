'use client';

import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatTaka } from '@/lib/format';
import { useRideHistory } from '@/lib/rides';

/**
 * When the ride just finished drops off the home screen, this is where the
 * passenger lands: a nudge to rate it, shown while the latest ride is a
 * completed one that has no rating yet.
 */
export function LastRideBanner() {
  const history = useRideHistory();
  const last = history.data?.[0];
  if (!last || last.status !== 'COMPLETED' || last.stars !== null) return null;

  return (
    <Alert>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          You arrived at {last.dropoffZone} · {formatTaka(last.farePoisha)} paid.
        </span>
        <Button asChild size="sm">
          <Link href={`/passenger/rides/${last.id}`}>Rate {last.driverName ?? 'your driver'}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
