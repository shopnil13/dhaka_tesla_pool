import {
  formatTaka,
  LATE_CANCEL_FEE_POISHA,
  type ActorRole,
  type PaymentMethod,
  type TimelineKind,
} from '@teslapool/shared';

/** A stored ride_events row, as much of it as the wording needs. */
export interface StoredEvent {
  /** Whether the event is about the passenger's own ride or the pool it rode in. */
  subject: 'RIDE' | 'POOL';
  from: string | null;
  to: string;
  actorRole: ActorRole;
  /** Name of the acting user (for driver actions, the driver's). */
  actorName: string | null;
  reason: string | null;
  metadata: unknown;
}

/** Facts about the passenger's own ride that the lines refer to. */
export interface RideContext {
  pickupZone: string;
  dropoffZone: string;
  paymentMethod: PaymentMethod;
}

export interface TimelineLine {
  kind: TimelineKind;
  title: string;
  detail: string | null;
}

/** A value inside event metadata (jsonb, so untyped), or null when absent. */
function field(metadata: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : null,
    metadata,
  );
}

/** A number inside event metadata, or null when absent or malformed. */
function amount(metadata: unknown, ...path: string[]): number | null {
  const value = field(metadata, ...path);
  return typeof value === 'number' ? value : null;
}

const paidWith = (method: PaymentMethod) => (method === 'TESLAPAY' ? 'by TeslaPay' : 'in cash');

/**
 * Turns one audit event into one line of the passenger's timeline. Pure, so
 * every wording is unit-tested. Only the ride's own facts and counts are
 * used: this is the single place that decides what a passenger may read
 * about their trip, and it never names or prices anyone else.
 */
export function describeRideEvent(event: StoredEvent, ride: RideContext): TimelineLine {
  const driver = event.actorRole === 'DRIVER' && event.actorName ? event.actorName : 'Your driver';

  if (event.subject === 'POOL') {
    if (event.to === 'DRIVER_ARRIVED') {
      return {
        kind: 'DRIVER_ARRIVED',
        title: `${driver} arrived at ${ride.pickupZone}`,
        detail: `Cancelling after this point costs ${formatTaka(LATE_CANCEL_FEE_POISHA)}`,
      };
    }
    return {
      kind: 'OTHER',
      title: `Trip ${event.to.toLowerCase().replaceAll('_', ' ')}`,
      detail: null,
    };
  }

  switch (event.to) {
    case 'REQUESTED': {
      if (event.from === null) {
        const quote = amount(event.metadata, 'quote', 'totalPoisha');
        return {
          kind: 'REQUESTED',
          title: 'You requested a ride',
          detail: `${ride.pickupZone} → ${ride.dropoffZone}${quote ? ` · upfront fare ${formatTaka(quote)}` : ''}`,
        };
      }
      return {
        kind: 'REQUEUED',
        title: event.actorRole === 'DRIVER' ? `${driver} cancelled the trip` : 'Back in the queue',
        detail: 'You are waiting for a Tesla again, at no charge',
      };
    }
    case 'MATCHED': {
      const seatsTaken = amount(event.metadata, 'seatsTaken');
      const capacity = amount(event.metadata, 'capacity');
      return {
        kind: 'MATCHED',
        title:
          event.actorRole === 'DRIVER'
            ? `${driver} accepted your request`
            : 'Matched into a shared Tesla',
        detail: seatsTaken && capacity ? `${seatsTaken} of ${capacity} seats now taken` : null,
      };
    }
    case 'IN_PROGRESS': {
      const fare = amount(event.metadata, 'finalFarePoisha');
      const riders = amount(event.metadata, 'ridersAtStart');
      const parts = [
        fare ? `Fare locked at ${formatTaka(fare)}` : null,
        riders && riders > 1 ? `${riders} bookings sharing the ride` : null,
      ].filter(Boolean);
      return { kind: 'STARTED', title: 'Trip started', detail: parts.join(' · ') || null };
    }
    case 'COMPLETED': {
      const fare = amount(event.metadata, 'farePoisha');
      const dues = amount(event.metadata, 'duesPoisha') ?? 0;
      const method = ride.paymentMethod;
      let detail: string | null = null;
      if (fare !== null) {
        detail = dues
          ? `Paid ${formatTaka(fare + dues)} ${paidWith(method)}: ${formatTaka(fare)} fare + ${formatTaka(dues)} owed from an earlier ride`
          : `Paid ${formatTaka(fare)} ${paidWith(method)}`;
      }
      return { kind: 'COMPLETED', title: `Dropped off at ${ride.dropoffZone}`, detail };
    }
    case 'CANCELLED': {
      const fee = amount(event.metadata, 'fee', 'feePoisha') ?? 0;
      let detail = 'No charge';
      if (fee > 0) {
        // A TeslaPay fee is paid on the spot; a cash one is owed (DUE) until the next ride.
        detail =
          field(event.metadata, 'fee', 'status') === 'PAID'
            ? `Late fee ${formatTaka(fee)} paid ${paidWith(ride.paymentMethod)}`
            : `Late fee ${formatTaka(fee)}, collected with your next ride`;
      }
      return {
        kind: 'CANCELLED',
        title: event.actorRole === 'PASSENGER' ? 'You cancelled' : 'Ride cancelled',
        detail,
      };
    }
    default:
      return {
        kind: 'OTHER',
        title: `Status changed to ${event.to.toLowerCase().replaceAll('_', ' ')}`,
        detail: event.reason,
      };
  }
}
