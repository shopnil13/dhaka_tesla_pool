'use client';

import type {
  DriverFeedItem,
  DriverPool,
  DriverProfile,
  DriverStatusInput,
} from '@teslapool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';

export const driverKeys = {
  profile: ['driver', 'profile'] as const,
  pool: ['driver', 'pool'] as const,
  feed: ['driver', 'requests'] as const,
};

export function useDriverProfile() {
  return useQuery({
    queryKey: driverKeys.profile,
    queryFn: async () => (await api<{ driver: DriverProfile }>('/driver/profile')).driver,
  });
}

/** Polled: passengers join (auto-match) and leave on their own. */
export function useDriverPool() {
  return useQuery({
    queryKey: driverKeys.pool,
    queryFn: async () => (await api<{ pool: DriverPool | null }>('/driver/pool')).pool,
    refetchInterval: 3000,
  });
}

/** Polled while online: new requests arrive at any time. */
export function useDriverFeed(online: boolean) {
  return useQuery({
    queryKey: driverKeys.feed,
    queryFn: async () => (await api<{ requests: DriverFeedItem[] }>('/driver/requests')).requests,
    enabled: online,
    refetchInterval: online ? 3000 : false,
  });
}

export function useUpdateDriverStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DriverStatusInput) =>
      (await api<{ driver: DriverProfile }>('/driver/status', { method: 'PATCH', body: input }))
        .driver,
    onSuccess: (driver) => {
      queryClient.setQueryData(driverKeys.profile, driver);
      void queryClient.invalidateQueries({ queryKey: driverKeys.feed });
    },
    onError: (error) => toast.error(error.message),
  });
}

/**
 * Accept, arrive, start, drop off and cancel all answer with the updated pool,
 * so one mutation shape covers them.
 */
export function usePoolCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) =>
      (await api<{ pool: DriverPool | null }>(path, { method: 'POST' })).pool,
    onSuccess: (pool) => {
      queryClient.setQueryData(driverKeys.pool, pool);
      void queryClient.invalidateQueries({ queryKey: driverKeys.feed });
      // Completing a pool moves the driver to the last drop-off zone.
      if (!pool) void queryClient.invalidateQueries({ queryKey: driverKeys.profile });
    },
    onError: (error) => toast.error(error.message),
  });
}
