'use client';

import { LoadError } from '@/components/load-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveRide } from '@/lib/rides';
import { ActiveRideCard } from './active-ride-card';
import { RequestRideForm } from './request-ride-form';

/** One active ride at a time: show it, or offer to request one. */
export function PassengerRideHome() {
  const active = useActiveRide();

  if (active.isPending) return <Skeleton className="h-96 w-full" />;
  if (active.error) {
    return <LoadError message={active.error.message} onRetry={() => active.refetch()} />;
  }
  return active.data ? <ActiveRideCard ride={active.data} /> : <RequestRideForm />;
}
