'use client';

import { LoadError } from '@/components/load-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveRide } from '@/lib/rides';
import { ActiveRideCard } from './active-ride-card';
import { LastRideBanner } from './last-ride-banner';
import { RequestRideForm } from './request-ride-form';

/** One active ride at a time: show it, or offer to request one (and to rate the last). */
export function PassengerRideHome() {
  const active = useActiveRide();

  if (active.isPending) return <Skeleton className="h-96 w-full" />;
  if (active.error) {
    return <LoadError message={active.error.message} onRetry={() => active.refetch()} />;
  }
  if (active.data) return <ActiveRideCard ride={active.data} />;
  return (
    <>
      <LastRideBanner />
      <RequestRideForm />
    </>
  );
}
