'use client';

import {
  tripSchema,
  type FareBreakdown,
  type PassengerRide,
  type RideRequestInput,
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
  estimate: (trip: TripInput) => ['fares', 'estimate', trip] as const,
};

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

export function useCancelRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rideId: string) =>
      (await api<{ ride: PassengerRide }>(`/rides/${rideId}/cancel`, { method: 'POST' })).ride,
    onSuccess: (ride) => {
      queryClient.setQueryData(rideKeys.active, null);
      void queryClient.invalidateQueries({ queryKey: rideKeys.history });
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
