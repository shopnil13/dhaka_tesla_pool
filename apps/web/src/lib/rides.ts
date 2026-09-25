'use client';

import {
  tripSchema,
  type FareBreakdown,
  type PassengerRide,
  type RateRideInput,
  type RideRequestInput,
  type RideStatus,
  type RideSummary,
  type RideTimelineEntry,
  type TripInput,
  type Zone,
} from '@teslapool/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { formatTaka } from './format';
import { walletKey } from './wallet';

export const rideKeys = {
  active: ['rides', 'active'] as const,
  history: ['rides', 'history'] as const,
  detail: (id: string) => ['rides', 'detail', id] as const,
  events: (id: string) => ['rides', 'events', id] as const,
  estimate: (trip: TripInput) => ['fares', 'estimate', trip] as const,
};

const ACTIVE_STATUSES: readonly RideStatus[] = ['REQUESTED', 'MATCHED', 'IN_PROGRESS'];
/** Still changing (so worth polling), as opposed to finished for good. */
export const isActiveRide = (status: RideStatus) => ACTIVE_STATUSES.includes(status);

/** Zones never change while the app runs, so they are fetched once. */
export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: async () => (await api<{ zones: Zone[] }>('/zones')).zones,
    staleTime: Infinity,
  });
}

export interface FareEstimate {
  distanceM: number;
  quote: FareBreakdown;
  bestCase: FareBreakdown | null;
}

/** Live upfront price; only asks the API once the trip itself is valid. */
export function useFareEstimate(trip: TripInput) {
  return useQuery({
    queryKey: rideKeys.estimate(trip),
    queryFn: async () =>
      (await api<{ estimate: FareEstimate }>('/fares/estimate', { body: trip })).estimate,
    enabled: tripSchema.safeParse(trip).success,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

/**
 * The passenger's current ride. Polled every 3 s while there is one, because
 * its status is changed by other people (the driver, other passengers).
 */
export function useActiveRide() {
  return useQuery({
    queryKey: rideKeys.active,
    queryFn: async () => (await api<{ ride: PassengerRide | null }>('/rides/active')).ride,
    refetchInterval: (query) => (query.state.data ? 3000 : false),
  });
}

export function useRequestRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RideRequestInput) =>
      (await api<{ ride: PassengerRide }>('/rides', { body: input })).ride,
    onSuccess: (ride) => {
      queryClient.setQueryData(rideKeys.active, ride);
      void queryClient.invalidateQueries({ queryKey: rideKeys.history });
    },
  });
}

/** Newest first. Not polled: it is refetched whenever a ride is booked, cancelled or rated. */
export function useRideHistory() {
  return useQuery({
    queryKey: rideKeys.history,
    queryFn: async () => (await api<{ rides: RideSummary[] }>('/rides')).rides,
  });
}

/** One ride; polled every 3 s only while it can still change. */
export function useRide(rideId: string) {
  return useQuery({
    queryKey: rideKeys.detail(rideId),
    queryFn: async () => (await api<{ ride: PassengerRide }>(`/rides/${rideId}`)).ride,
    refetchInterval: (query) =>
      query.state.data && isActiveRide(query.state.data.status) ? 3000 : false,
  });
}

/**
 * The ride's timeline, worded by the API. Polled while the ride is live; the
 * status is part of the key, so the final line (drop-off, cancellation) is
 * fetched the moment the ride's status changes, even though polling stops.
 */
export function useRideTimeline(rideId: string, status: RideStatus) {
  return useQuery({
    queryKey: [...rideKeys.events(rideId), status],
    queryFn: async () =>
      (await api<{ events: RideTimelineEntry[] }>(`/rides/${rideId}/events`)).events,
    placeholderData: keepPreviousData,
    refetchInterval: isActiveRide(status) ? 3000 : false,
  });
}

export function useRateRide(rideId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RateRideInput) =>
      (await api<{ ride: PassengerRide }>(`/rides/${rideId}/rating`, { body: input })).ride,
    onSuccess: (ride) => {
      queryClient.setQueryData(rideKeys.detail(ride.id), ride);
      void queryClient.invalidateQueries({ queryKey: rideKeys.history });
      toast.success(`Thanks! You rated ${ride.pool?.driverName ?? 'your driver'}.`);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useCancelRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rideId: string) =>
      (await api<{ ride: PassengerRide }>(`/rides/${rideId}/cancel`, { method: 'POST' })).ride,
    onSuccess: (ride) => {
      queryClient.setQueryData(rideKeys.active, null);
      queryClient.setQueryData(rideKeys.detail(ride.id), ride);
      void queryClient.invalidateQueries({ queryKey: rideKeys.history });
      void queryClient.invalidateQueries({ queryKey: rideKeys.events(ride.id) });
      void queryClient.invalidateQueries({ queryKey: walletKey });
      toast.success(
        ride.cancellationFeePoisha > 0
          ? `Ride cancelled. A ${formatTaka(ride.cancellationFeePoisha)} late fee was charged.`
          : 'Ride cancelled. No charge.',
      );
    },
    onError: (error) => toast.error(error.message),
  });
}
