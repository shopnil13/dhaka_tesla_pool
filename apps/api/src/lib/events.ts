import type { ActorRole } from '@teslapool/shared';
import type { Tx } from '../db/client';
import { rideEvents } from '../db/schema';

export interface RideEventInput {
  /** Exactly one of poolId / rideRequestId: what the event is about. */
  poolId?: string;
  rideRequestId?: string;
  from: string | null;
  to: string;
  /** null for SYSTEM actions (e.g. auto-matching). */
  actorId: string | null;
  actorRole: ActorRole;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Appends to the audit trail. Always called with the transaction that makes
 * the change, so a state change and its history row commit (or roll back)
 * together.
 */
export async function recordEvent(tx: Tx, event: RideEventInput) {
  await tx.insert(rideEvents).values({
    poolId: event.poolId ?? null,
    rideRequestId: event.rideRequestId ?? null,
    fromStatus: event.from,
    toStatus: event.to,
    actorId: event.actorId,
    actorRole: event.actorRole,
    reason: event.reason ?? null,
    metadata: event.metadata ?? null,
  });
}
