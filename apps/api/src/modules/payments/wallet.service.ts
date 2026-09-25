import {
  formatTaka,
  type OutstandingDue,
  type TopUpInput,
  type WalletView,
} from '@teslapool/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, type Tx } from '../../db/client';
import { payments, walletAccounts, walletTransactions } from '../../db/schema';
import { AppError } from '../../lib/errors';

/** Last in the lock order: driver_profiles → pools → ride_requests → wallet_accounts. */
export async function lockWallet(tx: Tx, userId: string) {
  const [wallet] = await tx
    .select()
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, userId))
    .for('update');
  if (!wallet) throw new AppError(409, 'CONFLICT', 'This account has no TeslaPay wallet');
  return wallet;
}

/**
 * Takes money out of TeslaPay for one payment: balance and ledger change
 * together, under the wallet lock. The CHECK (balance >= 0) backs this up, and
 * the unique payment_id on the ledger stops a payment being debited twice.
 */
export async function debitWallet(tx: Tx, userId: string, amountPoisha: number, paymentId: string) {
  const wallet = await lockWallet(tx, userId);
  if (wallet.balancePoisha < amountPoisha) {
    throw new AppError(
      422,
      'INSUFFICIENT_BALANCE',
      `TeslaPay balance ${formatTaka(wallet.balancePoisha)} does not cover ${formatTaka(amountPoisha)}`,
    );
  }
  const balanceAfterPoisha = wallet.balancePoisha - amountPoisha;
  await tx
    .update(walletAccounts)
    .set({ balancePoisha: balanceAfterPoisha, updatedAt: new Date() })
    .where(eq(walletAccounts.userId, userId));
  await tx.insert(walletTransactions).values({
    userId,
    paymentId,
    type: 'DEBIT',
    amountPoisha: -amountPoisha,
    balanceAfterPoisha,
  });
}

/** Simulated top-up (no gateway): recorded in the ledger like real money. */
export async function topUp(userId: string, { amountPoisha }: TopUpInput) {
  await db.transaction(async (tx) => {
    const wallet = await lockWallet(tx, userId);
    const balanceAfterPoisha = wallet.balancePoisha + amountPoisha;
    await tx
      .update(walletAccounts)
      .set({ balancePoisha: balanceAfterPoisha, updatedAt: new Date() })
      .where(eq(walletAccounts.userId, userId));
    await tx
      .insert(walletTransactions)
      .values({ userId, type: 'TOPUP', amountPoisha, balanceAfterPoisha });
  });
  return getWallet(userId);
}

/** Cash fees the passenger has not paid yet (collected with their next ride). */
export async function outstandingDues(passengerId: string, tx?: Tx) {
  return (tx ?? db)
    .select()
    .from(payments)
    .where(and(eq(payments.passengerId, passengerId), eq(payments.status, 'DUE')))
    .orderBy(asc(payments.createdAt));
}

/**
 * Checked when a TeslaPay ride is requested: the balance must cover the quote
 * plus anything still owed. No lock needed: a passenger has one active ride
 * at a time, so nothing else can spend from the wallet until this ride ends,
 * and top-ups only ever add. The fare can only drop and the ৳30 fee is less
 * than any fare, so whatever this ride ends up costing is covered.
 */
export async function assertTeslaPayCovers(passengerId: string, quotePoisha: number) {
  const [wallet] = await db
    .select({ balancePoisha: walletAccounts.balancePoisha })
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, passengerId));
  const duesPoisha = (await outstandingDues(passengerId)).reduce(
    (sum, d) => sum + d.amountPoisha,
    0,
  );
  const neededPoisha = quotePoisha + duesPoisha;
  const balancePoisha = wallet?.balancePoisha ?? 0;
  if (balancePoisha < neededPoisha) {
    throw new AppError(
      422,
      'INSUFFICIENT_BALANCE',
      `Your TeslaPay balance is ${formatTaka(balancePoisha)} but this ride needs ${formatTaka(neededPoisha)}` +
        `${duesPoisha > 0 ? ` (including ${formatTaka(duesPoisha)} you owe)` : ''}. Top up or pay cash.`,
      { balancePoisha, neededPoisha },
    );
  }
}

const DESCRIPTIONS = { FARE: 'Ride fare', CANCELLATION_FEE: 'Late cancellation fee' } as const;

export async function getWallet(userId: string): Promise<WalletView> {
  const [wallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, userId));
  const [dues, ledger] = await Promise.all([
    outstandingDues(userId),
    db
      .select({ entry: walletTransactions, purpose: payments.purpose })
      .from(walletTransactions)
      .leftJoin(payments, eq(payments.id, walletTransactions.paymentId))
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.id))
      .limit(30),
  ]);

  const duesView: OutstandingDue[] = dues.map((due) => ({
    rideRequestId: due.rideRequestId,
    purpose: due.purpose,
    amountPoisha: due.amountPoisha,
    createdAt: due.createdAt.toISOString(),
  }));
  return {
    balancePoisha: wallet?.balancePoisha ?? 0,
    dues: duesView,
    duesPoisha: duesView.reduce((sum, due) => sum + due.amountPoisha, 0),
    transactions: ledger.map(({ entry, purpose }) => ({
      id: entry.id,
      type: entry.type,
      amountPoisha: entry.amountPoisha,
      balanceAfterPoisha: entry.balanceAfterPoisha,
      description: entry.type === 'TOPUP' ? 'Top-up' : purpose ? DESCRIPTIONS[purpose] : 'Payment',
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
