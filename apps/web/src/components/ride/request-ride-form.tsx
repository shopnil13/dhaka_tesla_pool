'use client';

import {
  MAX_SEATS_PER_REQUEST,
  MAX_SHARED_SEATS,
  SHARE_DISCOUNT_PCT,
  tripSchema,
  type PaymentMethod,
  type TripInput,
  type Zone,
} from '@teslapool/shared';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { LoadError } from '@/components/load-error';
import { SegmentedControl } from '@/components/segmented-control';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTaka } from '@/lib/format';
import { useFareEstimate, useRequestRide, useZones } from '@/lib/rides';
import { useWallet } from '@/lib/wallet';
import { FareEstimatePanel } from './fare-estimate';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

interface ZoneSelectProps {
  id: string;
  label: string;
  zones: Zone[];
  value: number;
  error?: string;
  onChange: (zoneId: number) => void;
}

function ZoneSelect({ id, label, zones, value, error, onChange }: ZoneSelectProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={value || ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        <option value="" disabled>
          Choose an area
        </option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function RequestRideForm() {
  const zones = useZones();
  const requestRide = useRequestRide();
  const [trip, setTrip] = useState<TripInput>({
    pickupZoneId: 0,
    dropoffZoneId: 0,
    seats: 1,
    wantsShare: true,
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const estimate = useFareEstimate(trip);
  const wallet = useWallet();

  const check = tripSchema.safeParse(trip);
  const bothZonesChosen = trip.pickupZoneId > 0 && trip.dropoffZoneId > 0;
  const fieldErrors =
    !check.success && bothZonesChosen ? z.flattenError(check.error).fieldErrors : {};

  // Switching to "share" caps the seats instead of leaving an invalid form.
  const update = (patch: Partial<TripInput>) =>
    setTrip((current) => {
      const next = { ...current, ...patch };
      if (next.wantsShare && next.seats > MAX_SHARED_SEATS) next.seats = MAX_SHARED_SEATS;
      return next;
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (check.success) requestRide.mutate({ ...check.data, paymentMethod });
  };

  if (zones.isPending) return <Skeleton className="h-96 w-full" />;
  if (zones.error) {
    return <LoadError message={zones.error.message} onRetry={() => zones.refetch()} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where to?</CardTitle>
        <CardDescription>Pick your pickup and destination areas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ZoneSelect
              id="pickup"
              label="Pickup"
              zones={zones.data}
              value={trip.pickupZoneId}
              onChange={(pickupZoneId) => update({ pickupZoneId })}
            />
            <ZoneSelect
              id="dropoff"
              label="Destination"
              zones={zones.data}
              value={trip.dropoffZoneId}
              error={fieldErrors.dropoffZoneId?.[0]}
              onChange={(dropoffZoneId) => update({ dropoffZoneId })}
            />
          </div>

          <div className="grid gap-2">
            <Label>Ride type</Label>
            <SegmentedControl
              label="Ride type"
              value={trip.wantsShare ? 'share' : 'solo'}
              options={[
                { value: 'share', label: `Share & save ${SHARE_DISCOUNT_PCT}%` },
                { value: 'solo', label: 'Ride solo' },
              ]}
              onChange={(value) => update({ wantsShare: value === 'share' })}
            />
            <p className="text-sm text-muted-foreground">
              {trip.wantsShare
                ? 'You may share the Tesla with people heading the same way. You pay only for your own trip.'
                : 'The whole Tesla is yours. Nobody else joins.'}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Seats</Label>
            <SegmentedControl
              label="Seats"
              value={trip.seats}
              options={Array.from({ length: MAX_SEATS_PER_REQUEST }, (_, i) => ({
                value: i + 1,
                label: String(i + 1),
                disabled: trip.wantsShare && i + 1 > MAX_SHARED_SEATS,
              }))}
              onChange={(seats) => update({ seats })}
            />
            {trip.wantsShare && (
              <p className="text-sm text-muted-foreground">
                A shared ride books at most {MAX_SHARED_SEATS} seats.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Payment</Label>
            <SegmentedControl
              label="Payment"
              value={paymentMethod}
              options={[
                { value: 'CASH', label: 'Cash' },
                {
                  value: 'TESLAPAY',
                  label: wallet.data
                    ? `TeslaPay · ${formatTaka(wallet.data.balancePoisha)}`
                    : 'TeslaPay',
                },
              ]}
              onChange={setPaymentMethod}
            />
          </div>

          <FareEstimatePanel
            tripIsValid={check.success}
            estimate={estimate.data}
            isLoading={estimate.isFetching && !estimate.data}
            error={estimate.error}
          />

          {requestRide.error && (
            <Alert variant="destructive">
              <AlertDescription>{requestRide.error.message}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" disabled={!check.success || requestRide.isPending}>
            {requestRide.isPending
              ? 'Requesting…'
              : estimate.data && check.success
                ? `Request ride · ${formatTaka(estimate.data.quote.totalPoisha)}`
                : 'Request ride'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
