import type { Metadata } from 'next';
import { DriverHistoryView } from '@/components/driver/driver-history';

export const metadata: Metadata = { title: 'Trip history' };

export default function DriverHistoryPage() {
  return <DriverHistoryView />;
}
