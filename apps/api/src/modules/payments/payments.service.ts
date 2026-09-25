import { eq } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import { payments } from '../../db/schema';
import type { RideRow } from '../pools/pools.repository';
import { debitWallet, outstandingDues } from './wallet.service';

/**
 * Charges a ride when its passenger is dropped off: the fare frozen at start,
 * plus any cash fee still owed from an earlier ride.
 *   TeslaPay → debited from the wallet now (the request-time balance check
 *              guaranteed it is covered).
 *   Cash     → the driver collects it (their screen shows the total) and it is
 *              recorded as paid.
 * Runs inside the drop-off transaction, after the pool and ride locks.
 */
export async function chargeRide(tx: Tx, ride: RideRow) {
  if (ride.finalFarePoisha === null) throw new Error(`Ride ${ride.id} has no final fare`);
  const teslaPay = ride.paymentMethod === 'TESLAPAY';
  const now = new Date();

  const [fare] = await tx
    .insert(payments)
    .values({
      passengerId: ride.passengerId,
      rideRequestId: ride.id,
      purpose: 'FARE',
      method: ride.paymentMethod,
      amountPoisha: ride.finalFarePoisha,
      status: 'PAID',
      paidAt: now,
    })
    .returning();
  if (teslaPay) await debitWallet(tx, ride.passengerId, fare!.amountPoisha, fare!.id);

  let duesPoisha = 0;
  for (const due of await outstandingDues(ride.passengerId, tx)) {
    await tx
      .update(payments)
      .set({
        status: 'PAID',
        paidAt: now,
        method: ride.paymentMethod,
        settledInRideRequestId: ride.id,
      })
      .where(eq(payments.id, due.id));
    if (teslaPay) await debitWallet(tx, ride.passengerId, due.amountPoisha, due.id);
    duesPoisha += due.amountPoisha;
  }

  return { farePoisha: fare!.amountPoisha, duesPoisha, method: ride.paymentMethod };
}

/**
 * Late-cancellation fee. TeslaPay pays it now: the request-time check made the
 * balance cover the quote, and the fee (৳30) is below any possible fare.
 * Cash cannot be collected from someone who is not getting in, so it becomes a
 * DUE that is collected together with their next ride's fare.
 */
export async function chargeCancellationFee(tx: Tx, ride: RideRow, feePoisha: number) {
  const teslaPay = ride.paymentMethod === 'TESLAPAY';
  const [fee] = await tx
    .insert(payments)
    .values({
      passengerId: ride.passengerId,
      rideRequestId: ride.id,
      purpose: 'CANCELLATION_FEE',
      method: ride.paymentMethod,
      amountPoisha: feePoisha,
      status: teslaPay ? 'PAID' : 'DUE',
      paidAt: teslaPay ? new Date() : null,
    })
    .returning();
  if (teslaPay) await debitWallet(tx, ride.passengerId, feePoisha, fee!.id);
  return { feePoisha, status: fee!.status };
}
