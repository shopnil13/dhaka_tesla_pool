'use client';

import type { TopUpInput, WalletView } from '@teslapool/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { formatTaka } from './format';

export const walletKey = ['wallet'] as const;

export function useWallet() {
  return useQuery({
    queryKey: walletKey,
    queryFn: async () => (await api<{ wallet: WalletView }>('/wallet')).wallet,
  });
}

export function useTopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TopUpInput) =>
      (await api<{ wallet: WalletView }>('/wallet/top-up', { body: input })).wallet,
    onSuccess: (wallet, input) => {
      queryClient.setQueryData(walletKey, wallet);
      toast.success(`Added ${formatTaka(input.amountPoisha)} to TeslaPay`);
    },
    onError: (error) => toast.error(error.message),
  });
}
