'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveRide } from '@/lib/rides';
import { ActiveRideCard } from './active-ride-card';
import { RequestRideForm } from './request-ride-form';

/** One active ride at a time: show it, or offer to request one. */
export function PassengerRideHome() {
  const active = useActiveRide();

  if (active.isPending) return <Skeleton className="h-96 w-full" />;
  if (active.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          {active.error.message}
          <Button variant="outline" size="sm" onClick={() => active.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return active.data ? <ActiveRideCard ride={active.data} /> : <RequestRideForm />;
}
