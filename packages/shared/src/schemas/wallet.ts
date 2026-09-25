import { z } from 'zod';
import type { PaymentMethod, PaymentPurpose, PaymentStatus, WalletTransactionType } from '../enums';

/** Simulated TeslaPay top-up: whole taka, ৳1–৳2000 at a time. */
export const topUpSchema = z.object({
  amountPoisha: z
    .number()
    .int()
    .min(100, 'Top up at least ৳1')
    .max(200_000, 'Top up at most ৳2000 at a time')
    .refine((poisha) => poisha % 100 === 0, 'Top up whole taka'),
});
export type TopUpInput = z.infer<typeof topUpSchema>;

export interface WalletTransactionView {
  id: number;
  type: WalletTransactionType;
  /** Positive for top-ups, negative for debits. */
  amountPoisha: number;
  balanceAfterPoisha: number;
  description: string;
  createdAt: string;
}

export interface OutstandingDue {
  rideRequestId: string;
  purpose: PaymentPurpose;
  amountPoisha: number;
  createdAt: string;
}

export interface WalletView {
  balancePoisha: number;
  /** Unpaid cash fees, collected with the next ride. */
  dues: OutstandingDue[];
  duesPoisha: number;
  transactions: WalletTransactionView[];
}

export interface PaymentView {
  purpose: PaymentPurpose;
  method: PaymentMethod;
  status: PaymentStatus;
  amountPoisha: number;
}
