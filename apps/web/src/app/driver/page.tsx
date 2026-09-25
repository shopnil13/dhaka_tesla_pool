import type { Metadata } from 'next';
import { DriverDashboard } from '@/components/driver/driver-dashboard';

export const metadata: Metadata = { title: 'Driver' };

export default function DriverHome() {
  return <DriverDashboard />;
}
