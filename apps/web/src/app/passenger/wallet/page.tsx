import type { Metadata } from 'next';
import { WalletView } from '@/components/wallet/wallet-view';

export const metadata: Metadata = { title: 'TeslaPay' };

export default function WalletPage() {
  return <WalletView />;
}
