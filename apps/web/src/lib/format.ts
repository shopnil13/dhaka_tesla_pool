export { formatTaka } from '@teslapool/shared';

/** 2500 → "2.5 km" */
export const formatKm = (metres: number) => `${(metres / 1000).toFixed(1)} km`;

const ordinals = ['1st', '2nd', '3rd'];
/** 1 → "1st" (drop-off positions never exceed a Tesla's seats). */
export const ordinal = (n: number) => ordinals[n - 1] ?? `${n}th`;

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  dateStyle: 'medium',
  timeStyle: 'short',
});
/** Timestamps are stored in UTC; riders live in Dhaka. */
export const formatDhakaTime = (iso: string) => timeFormat.format(new Date(iso));

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  timeStyle: 'short',
});
/** Just the Dhaka time of day ("14:05"), for lines under a dated heading. */
export const formatDhakaClock = (iso: string) => clockFormat.format(new Date(iso));
