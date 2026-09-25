'use client';

import type { DriverProfile } from '@teslapool/shared';
import { SegmentedControl } from '@/components/segmented-control';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useUpdateDriverStatus } from '@/lib/driver';
import { useZones } from '@/lib/rides';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:w-56';

export function StatusCard({ driver, poolActive }: { driver: DriverProfile; poolActive: boolean }) {
  const zones = useZones();
  const updateStatus = useUpdateDriverStatus();
  const zoneId = driver.zone?.id ?? zones.data?.[0]?.id ?? 0;
  const locked = poolActive || updateStatus.isPending;

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {driver.vehicle.name} · {driver.vehicle.plate} · {driver.vehicle.capacity} seats
        </CardDescription>
        <CardTitle className="text-xl">
          {driver.isOnline ? `Online in ${driver.zone?.name}` : 'You are offline'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label>Availability</Label>
          <SegmentedControl
            label="Availability"
            value={driver.isOnline ? 'online' : 'offline'}
            options={[
              { value: 'online', label: 'Online', disabled: locked },
              { value: 'offline', label: 'Offline', disabled: locked },
            ]}
            onChange={(value) =>
              updateStatus.mutate({ isOnline: value === 'online', currentZoneId: zoneId })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="driver-zone">Waiting in</Label>
          <select
            id="driver-zone"
            className={SELECT_CLASS}
            value={zoneId || ''}
            disabled={locked || !zones.data}
            onChange={(event) =>
              updateStatus.mutate({
                isOnline: driver.isOnline,
                currentZoneId: Number(event.target.value),
              })
            }
          >
            {zones.data?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>
        {poolActive && (
          <p className="text-sm text-muted-foreground">
            Finish or cancel your current pool to go offline or change zone.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
