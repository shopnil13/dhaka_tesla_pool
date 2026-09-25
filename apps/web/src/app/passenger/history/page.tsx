import type { Metadata } from 'next';
import { RideHistory } from '@/components/ride/ride-history';

export const metadata: Metadata = { title: 'Ride history' };

export default function RideHistoryPage() {
  return <RideHistory />;
}
