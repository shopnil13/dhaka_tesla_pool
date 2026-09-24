import { timestamp } from 'drizzle-orm/pg-core';

/** Every timestamp is stored as timestamptz (UTC); the UI renders Asia/Dhaka. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
