'use client';

import { LoadError } from '@/components/load-error';
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
      <LoadError
        message={error.message}
        onRetry={() => {
          void profile.refetch();
          void pool.refetch();
        }}
      />
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
