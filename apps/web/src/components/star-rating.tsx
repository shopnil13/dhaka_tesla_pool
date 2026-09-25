import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export const STAR_VALUES = [1, 2, 3, 4, 5] as const;

/** Read-only stars, e.g. a given rating in a list. */
export function StarRating({ stars, className }: { stars: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${stars} out of 5 stars`}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {STAR_VALUES.map((value) => (
        <Star
          key={value}
          aria-hidden
          className={cn(
            'size-3.5',
            value <= stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}

/** A driver's average for display: "★ 4.5 (2)". */
export function AverageRating({ average, count }: { average: number; count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      aria-label={`Rated ${average} out of 5 by ${count} ${count === 1 ? 'rider' : 'riders'}`}
    >
      <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
      {average.toFixed(1)} ({count})
    </span>
  );
}
