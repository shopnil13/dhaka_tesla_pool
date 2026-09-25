import { Skeleton } from '@/components/ui/skeleton';
import { formatKm, formatTaka } from '@/lib/format';
import type { FareEstimate } from '@/lib/rides';

interface FareEstimatePanelProps {
  tripIsValid: boolean;
  estimate: FareEstimate | undefined;
  isLoading: boolean;
  error: Error | null;
}

/** The upfront price, with the arithmetic spelled out so it can be checked by hand. */
export function FareEstimatePanel({
  tripIsValid,
  estimate,
  isLoading,
  error,
}: FareEstimatePanelProps) {
  if (!tripIsValid) {
    return (
      <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        Choose a pickup and a destination to see your fare.
      </p>
    );
  }
  if (error) {
    return <p className="rounded-lg bg-muted p-4 text-sm text-destructive">{error.message}</p>;
  }
  if (isLoading || !estimate) {
    return <Skeleton className="h-20 w-full" />;
  }

  const { quote, bestCase, distanceM } = estimate;
  return (
    <div className="grid gap-1 rounded-lg bg-muted p-4" aria-live="polite">
      <p className="text-sm text-muted-foreground">Your fare, fixed up front</p>
      <p className="font-heading text-3xl font-semibold">{formatTaka(quote.totalPoisha)}</p>
      <p className="text-sm text-muted-foreground">
        ({formatTaka(quote.baseFarePoisha)} base + {formatTaka(quote.distanceChargePoisha)} for{' '}
        {formatKm(distanceM)}){quote.seats > 1 ? ` × ${quote.seats} seats` : ''}
        {quote.discountPct > 0 ? ` − ${quote.discountPct}% share discount` : ''}
      </p>
      {bestCase && (
        <p className="text-sm">
          Could drop to <strong>{formatTaka(bestCase.totalPoisha)}</strong> if the Tesla fills up —
          it never goes up.
        </p>
      )}
    </div>
  );
}
