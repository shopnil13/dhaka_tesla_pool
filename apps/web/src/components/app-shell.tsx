'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useLogout, useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
}

function AreaNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-3xl gap-1 px-4" aria-label="Sections">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              active
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header + page frame for the signed-in areas (passenger and driver). */
export function AppShell({ children, nav = [] }: { children: ReactNode; nav?: NavItem[] }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();
  const sessionExpired = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (sessionExpired) router.replace('/login');
  }, [sessionExpired, router]);

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="font-heading font-semibold tracking-tight">
            Dhaka Tesla Pool
          </Link>
          {me.data && (
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">{me.data.name}</span>
              <Badge variant="secondary">
                {me.data.role === 'DRIVER' ? 'Driver' : 'Passenger'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
        {nav.length > 0 && <AreaNav items={nav} />}
      </header>

      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        {me.isPending || sessionExpired ? (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : me.error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              {me.error.message}
              <Button variant="outline" size="sm" onClick={() => me.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
