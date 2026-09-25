'use client';

import type { DriverPool, DriverPoolMember } from '@teslapool/shared';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePoolCommand } from '@/lib/driver';
import { formatTaka, ordinal } from '@/lib/format';
import { cn } from '@/lib/utils';

const HEADLINES: Record<DriverPool['status'], (pool: DriverPool) => string> = {
  ACCEPTED: (pool) => `Head to ${pool.pickupZone} for pickup`,
  DRIVER_ARRIVED: (pool) => `Waiting at ${pool.pickupZone}`,
  STARTED: () => 'On the road',
  COMPLETED: () => 'Trip complete',
  CANCELLED: () => 'Trip cancelled',
};

const MEMBER_STATUS: Record<DriverPoolMember['status'], string> = {
  REQUESTED: 'Waiting',
  MATCHED: 'Booked',
  IN_PROGRESS: 'Riding',
  COMPLETED: 'Dropped off',
  CANCELLED: 'Cancelled',
};

function SeatMeter({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${taken} of ${capacity} seats taken`}>
      <div className="flex gap-1">
        {Array.from({ length: capacity }, (_, i) => (
          <span
            key={i}
            className={cn('size-3 rounded-full', i < taken ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {taken}/{capacity} seats
      </span>
    </div>
  );
}

export function PoolCard({ pool }: { pool: DriverPool }) {
  const command = usePoolCommand();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const base = `/driver/pools/${pool.id}`;
  const canCancel = pool.status === 'ACCEPTED' || pool.status === 'DRIVER_ARRIVED';

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Current pool · {pool.isShared ? 'shared' : 'solo'} · picked up in {pool.pickupZone}
        </CardDescription>
        <CardTitle className="text-xl">{HEADLINES[pool.status](pool)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <SeatMeter taken={pool.seatsTaken} capacity={pool.capacity} />

        <ul className="grid gap-2">
          {pool.members.map((member) => (
            <li
              key={member.rideRequestId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="grid gap-0.5">
                <p className="font-medium">
                  {member.dropoffOrder ? `${ordinal(member.dropoffOrder)} stop · ` : ''}
                  {member.passengerName} → {member.dropoffZone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {member.seats} {member.seats === 1 ? 'seat' : 'seats'} ·{' '}
                  {formatTaka(member.finalFarePoisha ?? member.quotedFarePoisha)}{' '}
                  {member.paymentMethod === 'CASH' ? 'cash' : 'TeslaPay'}
                </p>
              </div>
              {member.status === 'IN_PROGRESS' ? (
                <Button
                  size="sm"
                  disabled={command.isPending}
                  onClick={() => command.mutate(`${base}/riders/${member.rideRequestId}/drop-off`)}
                >
                  Drop off
                </Button>
              ) : (
                <Badge variant="secondary">{MEMBER_STATUS[member.status]}</Badge>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {pool.status === 'ACCEPTED' && (
            <Button disabled={command.isPending} onClick={() => command.mutate(`${base}/arrive`)}>
              I&apos;ve arrived at {pool.pickupZone}
            </Button>
          )}
          {pool.status === 'DRIVER_ARRIVED' && (
            <Button disabled={command.isPending} onClick={() => command.mutate(`${base}/start`)}>
              Start trip
            </Button>
          )}
          {canCancel &&
            (confirmingCancel ? (
              <>
                <Button
                  variant="destructive"
                  disabled={command.isPending}
                  onClick={() => {
                    command.mutate(`${base}/cancel`);
                    setConfirmingCancel(false);
                  }}
                >
                  Yes, cancel pool
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
                Cancel pool
              </Button>
            ))}
        </div>
        {confirmingCancel && (
          <p className="text-sm text-muted-foreground">
            Your passengers go back to the queue and are not charged.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
