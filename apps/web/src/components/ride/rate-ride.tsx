'use client';

import { rateRideSchema, type PassengerRide } from '@teslapool/shared';
import { Star } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { STAR_VALUES, StarRating } from '@/components/star-rating';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRateRide } from '@/lib/rides';
import { cn } from '@/lib/utils';

const MAX_COMMENT = 280;

function RatingForm({ rideId, driverName }: { rideId: string; driverName: string }) {
  const rateRide = useRateRide(rideId);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const check = rateRideSchema.safeParse({ stars, comment });
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? 'Check your rating');
      return;
    }
    setError(null);
    rateRide.mutate(check.data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>How was your ride with {driverName}?</CardTitle>
        <CardDescription>You can rate each ride once.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {/* Real radio buttons (visually replaced by stars) keep arrow-key navigation. */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Stars</legend>
            <div className="flex gap-1">
              {STAR_VALUES.map((value) => (
                <label
                  key={value}
                  className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                >
                  <input
                    type="radio"
                    name="stars"
                    value={value}
                    checked={stars === value}
                    onChange={() => setStars(value)}
                    className="sr-only"
                  />
                  <Star
                    aria-hidden
                    className={cn(
                      'size-7 transition-colors',
                      value <= stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
                    )}
                  />
                  <span className="sr-only">
                    {value} {value === 1 ? 'star' : 'stars'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor="rating-comment">Comment (optional)</Label>
            <Textarea
              id="rating-comment"
              value={comment}
              maxLength={MAX_COMMENT}
              placeholder="Anything the driver should know?"
              onChange={(event) => setComment(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {comment.length}/{MAX_COMMENT}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={rateRide.isPending} className="justify-self-start">
            {rateRide.isPending ? 'Sending…' : 'Submit rating'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** After drop-off: the form, or the rating already given. Nothing for unfinished rides. */
export function RateRide({ ride }: { ride: PassengerRide }) {
  if (ride.status !== 'COMPLETED') return null;
  const driverName = ride.pool?.driverName ?? 'your driver';

  if (!ride.rating) return <RatingForm rideId={ride.id} driverName={driverName} />;
  return (
    <Card>
      <CardHeader>
        <CardDescription>You rated {driverName}</CardDescription>
        <CardTitle>
          <StarRating stars={ride.rating.stars} className="[&_svg]:size-5" />
        </CardTitle>
      </CardHeader>
      {ride.rating.comment && (
        <CardContent>
          <p className="text-sm">“{ride.rating.comment}”</p>
        </CardContent>
      )}
    </Card>
  );
}
