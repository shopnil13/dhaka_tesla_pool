'use client';

import type { AuthUser, LoginInput, RegisterInput, UserRole } from '@teslapool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from './api';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export const homeFor = (role: UserRole) => (role === 'DRIVER' ? '/driver' : '/passenger');

/**
 * Where to go after signing in. Only paths inside the user's own area are
 * honoured, so a crafted ?next= link cannot bounce anyone to another site.
 */
export function safeRedirect(next: string | undefined, role: UserRole) {
  const home = homeFor(role);
  return next && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => (await api<{ user: AuthUser }>('/auth/me')).user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) =>
      (await api<{ user: AuthUser }>('/auth/login', { body: input })).user,
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterInput) =>
      (await api<{ user: AuthUser }>('/auth/register', { body: input })).user,
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // Drop every cached query so the next user never sees this user's data.
      queryClient.clear();
      router.replace('/login');
    },
  });
}
