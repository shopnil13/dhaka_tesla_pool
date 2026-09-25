import type { Metadata } from 'next';
import { RideDetail } from '@/components/ride/ride-detail';

export const metadata: Metadata = { title: 'Your ride' };

export default async function RidePage({ params }: PageProps<'/passenger/rides/[id]'>) {
  const { id } = await params;
  return <RideDetail rideId={id} />;
}
