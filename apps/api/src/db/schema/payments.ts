import { PAYMENT_PURPOSES, PAYMENT_STATUSES, WALLET_TRANSACTION_TYPES } from '@teslapool/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgEnum, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './columns';
import { paymentMethod, rideRequests } from './rides';
import { users } from './users';

export const paymentPurpose = pgEnum('payment_purpose', PAYMENT_PURPOSES);
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES);
export const walletTransactionType = pgEnum('wallet_transaction_type', WALLET_TRANSACTION_TYPES);

/**
 * Money owed for a ride: its fare, or a late-cancellation fee. A cash fee the
 * passenger could not pay on the spot stays DUE until it is collected during
 * a later ride (settled_in_ride_request_id). All amounts are integer poisha.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id),
    rideRequestId: uuid('ride_request_id')
      .notNull()
      .references(() => rideRequests.id),
    purpose: paymentPurpose('purpose').notNull(),
    method: paymentMethod('method').notNull(),
    amountPoisha: integer('amount_poisha').notNull(),
    status: paymentStatus('status').notNull(),
    settledInRideRequestId: uuid('settled_in_ride_request_id').references(() => rideRequests.id),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    paidAt: timestamptz('paid_at'),
  },
  (t) => [
    check('payments_amount_positive', sql`${t.amountPoisha} > 0`),
    check('payments_paid_has_time', sql`(${t.status} = 'PAID') = (${t.paidAt} IS NOT NULL)`),
    // A ride is charged its fare at most once, and a fee at most once.
    unique('payments_one_per_purpose').on(t.rideRequestId, t.purpose),
    index('payments_outstanding_by_passenger_idx')
      .on(t.passengerId)
      .where(sql`${t.status} = 'DUE'`),
  ],
);

/** Simulated TeslaPay balance. The CHECK makes an overdraft impossible. */
export const walletAccounts = pgTable(
  'wallet_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    balancePoisha: integer('balance_poisha').notNull().default(0),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('wallet_accounts_balance_non_negative', sql`${t.balancePoisha} >= 0`)],
);

/**
 * Append-only ledger. The balance on wallet_accounts is a cached running
 * total; the sum of a user's transactions must always equal it.
 */
export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => walletAccounts.userId),
    // UNIQUE: a payment can be debited from the wallet at most once.
    paymentId: uuid('payment_id')
      .unique()
      .references(() => payments.id),
    type: walletTransactionType('type').notNull(),
    amountPoisha: integer('amount_poisha').notNull(),
    balanceAfterPoisha: integer('balance_after_poisha').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('wallet_transactions_balance_after_non_negative', sql`${t.balanceAfterPoisha} >= 0`),
    check(
      'wallet_transactions_sign_matches_type',
      sql`(${t.type} = 'TOPUP' AND ${t.amountPoisha} > 0 AND ${t.paymentId} IS NULL)
        OR (${t.type} = 'DEBIT' AND ${t.amountPoisha} < 0 AND ${t.paymentId} IS NOT NULL)`,
    ),
    index('wallet_transactions_user_history_idx').on(t.userId, t.createdAt.desc()),
  ],
);
