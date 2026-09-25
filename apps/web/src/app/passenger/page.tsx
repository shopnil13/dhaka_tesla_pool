import type { Metadata } from 'next';
import { PassengerRideHome } from '@/components/ride/passenger-ride-home';

export const metadata: Metadata = { title: 'Your ride' };

export default function PassengerHome() {
  return <PassengerRideHome />;
}
