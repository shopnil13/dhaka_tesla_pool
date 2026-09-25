'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDriverFeed, useDriverPool, useDriverProfile } from '@/lib/driver';
import { PoolCard } from './pool-card';
import { RequestFeed } from './request-feed';
import { StatusCard } from './status-card';

export function DriverDashboard() {
  const profile = useDriverProfile();
  const pool = useDriverPool();
  const online = profile.data?.isOnline ?? false;
  const feed = useDriverFeed(online);

  const error = profile.error ?? pool.error;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          {error.message}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void profile.refetch();
              void pool.refetch();
            }}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!profile.data || pool.data === undefined) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <StatusCard driver={profile.data} poolActive={pool.data !== null} />
      {pool.data && <PoolCard pool={pool.data} />}
      <RequestFeed
        online={online}
        zoneName={profile.data.zone?.name}
        requests={feed.data}
        isLoading={feed.isPending}
        error={feed.error}
      />
    </>
  );
}
