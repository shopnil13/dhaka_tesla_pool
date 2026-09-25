'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDhakaTime, formatTaka } from '@/lib/format';
import { useTopUp, useWallet } from '@/lib/wallet';
import { cn } from '@/lib/utils';

const TOP_UP_AMOUNTS = [10_000, 20_000, 50_000]; // ৳100, ৳200, ৳500

export function WalletView() {
  const wallet = useWallet();
  const topUp = useTopUp();

  if (wallet.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-4">
          {wallet.error.message}
          <Button variant="outline" size="sm" onClick={() => wallet.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!wallet.data) return <Skeleton className="h-96 w-full" />;
  const { balancePoisha, duesPoisha, transactions } = wallet.data;

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>TeslaPay balance (simulated)</CardDescription>
          <CardTitle className="font-heading text-4xl">{formatTaka(balancePoisha)}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {duesPoisha > 0 && (
            <Alert>
              <AlertDescription>
                You owe {formatTaka(duesPoisha)} from a late cancellation. It is added to your next
                ride.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Top up</span>
            {TOP_UP_AMOUNTS.map((amountPoisha) => (
              <Button
                key={amountPoisha}
                variant="outline"
                size="sm"
                disabled={topUp.isPending}
                onClick={() => topUp.mutate({ amountPoisha })}
              >
                + {formatTaka(amountPoisha)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="divide-y">
              {transactions.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="grid gap-0.5">
                    <p className="text-sm font-medium">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDhakaTime(entry.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        entry.amountPoisha > 0 ? 'text-emerald-600' : '',
                      )}
                    >
                      {entry.amountPoisha > 0 ? '+' : '−'}
                      {formatTaka(Math.abs(entry.amountPoisha))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      balance {formatTaka(entry.balanceAfterPoisha)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
