'use client';

import Link from 'next/link';
import { LoadError } from '@/components/load-error';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { isActiveRide, useRide } from '@/lib/rides';
import { ActiveRideCard } from './active-ride-card';
import { PastRideCard } from './past-ride-card';
import { RateRide } from './rate-ride';
import { RideTimeline } from './ride-timeline';

function BackToHistory() {
  return (
    <Link
      href="/passenger/history"
      className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      ← All rides
    </Link>
  );
}

/** One ride's page: live status (or the final bill), the rating, and the timeline. */
export function RideDetail({ rideId }: { rideId: string }) {
  const ride = useRide(rideId);

  if (ride.error) {
    // Someone else's ride is a 404 too: the API never confirms it exists.
    if (ride.error instanceof ApiError && ride.error.status === 404) {
      return (
        <>
          <BackToHistory />
          <Card>
            <CardHeader>
              <CardTitle>Ride not found</CardTitle>
              <CardDescription>It may have been removed, or the link is wrong.</CardDescription>
            </CardHeader>
          </Card>
        </>
      );
    }
    return <LoadError message={ride.error.message} onRetry={() => ride.refetch()} />;
  }
  if (!ride.data) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <BackToHistory />
      {isActiveRide(ride.data.status) ? (
        <ActiveRideCard ride={ride.data} showDetailsLink={false} />
      ) : (
        <PastRideCard ride={ride.data} />
      )}
      <RateRide ride={ride.data} />
      <RideTimeline rideId={rideId} status={ride.data.status} />
    </>
  );
}
