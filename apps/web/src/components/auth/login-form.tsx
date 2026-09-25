'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@teslapool/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { safeRedirect, useLogin } from '@/lib/auth';

const DEMO_ACCOUNTS = [
  { name: 'Nusrat', email: 'nusrat@teslapool.test', role: 'Passenger' },
  { name: 'Rafiq', email: 'rafiq@teslapool.test', role: 'Passenger' },
  { name: 'Shirin', email: 'shirin@teslapool.test', role: 'Passenger' },
  { name: 'Jashim', email: 'jashim@teslapool.test', role: 'Driver' },
] as const;

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const login = useLogin();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const user = await login.mutateAsync(values);
      router.replace(safeRedirect(next, user.role));
    } catch {
      // Shown from login.error below.
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Passengers and drivers sign in here.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {login.error && (
            <Alert variant="destructive">
              <AlertDescription>{login.error.message}</AlertDescription>
            </Alert>
          )}
          <FormField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...form.register('email')}
          />
          <FormField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...form.register('password')}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            Demo accounts (the password is in the README):
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setValue('email', account.email);
                  form.setFocus('password');
                }}
              >
                {account.name} · {account.role}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        New passenger?&nbsp;
        <Link href="/register" className="font-medium text-foreground underline">
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
