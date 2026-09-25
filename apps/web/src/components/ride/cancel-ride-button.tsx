'use client';

import type { PassengerRide } from '@teslapool/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatTaka } from '@/lib/format';
import { useCancelRide } from '@/lib/rides';

/**
 * Two-step cancel: the confirmation states the cost first. The fee shown comes
 * from the API (ride.cancellation), which applies the same policy it will
 * enforce; if the driver arrives in between, the API still decides.
 */
export function CancelRideButton({ ride }: { ride: PassengerRide }) {
  const cancelRide = useCancelRide();
  const [confirming, setConfirming] = useState(false);
  if (!ride.cancellation.allowed) return null;

  const fee = ride.cancellation.feePoisha;
  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        Cancel ride
      </Button>
    );
  }
  return (
    <div className="grid gap-3 rounded-lg border border-destructive/40 p-4">
      <p className="text-sm">
        {fee > 0
          ? `${ride.pool?.driverName ?? 'Your driver'} is already waiting for you. Cancelling now costs ${formatTaka(fee)}${
              ride.paymentMethod === 'CASH' ? ', added to your next ride' : ' from TeslaPay'
            }.`
          : 'Cancelling now is free.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          disabled={cancelRide.isPending}
          onClick={() => cancelRide.mutate(ride.id)}
        >
          {cancelRide.isPending
            ? 'Cancelling…'
            : fee > 0
              ? `Cancel and pay ${formatTaka(fee)}`
              : 'Yes, cancel'}
        </Button>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Keep my ride
        </Button>
      </div>
    </div>
  );
}
