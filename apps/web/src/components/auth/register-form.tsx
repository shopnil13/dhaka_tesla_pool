'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@teslapool/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { ApiError } from '@/lib/api';
import { homeFor, useRegister } from '@/lib/auth';

const FIELDS = ['name', 'email', 'password'] as const;

export function RegisterForm() {
  const router = useRouter();
  const registerPassenger = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await registerPassenger.mutateAsync(values as RegisterInput);
      router.replace(homeFor(user.role));
    } catch (err) {
      // Put API errors next to the field they are about when we can.
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        form.setError('email', { message: err.message });
      } else if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        for (const field of FIELDS) {
          const message = err.fieldErrors[field]?.[0];
          if (message) form.setError(field, { message });
        }
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong');
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a passenger account</CardTitle>
        <CardDescription>Request a ride, share a Tesla, pay your own fare.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <FormField
            id="name"
            label="Name"
            autoComplete="name"
            error={errors.name?.message}
            {...form.register('name')}
          />
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
            autoComplete="new-password"
            error={errors.password?.message}
            {...form.register('password')}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Already riding with us?&nbsp;
        <Link href="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
