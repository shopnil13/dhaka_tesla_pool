import { AppShell, type NavItem } from '@/components/app-shell';

const PASSENGER_NAV: NavItem[] = [
  { href: '/passenger', label: 'Ride' },
  { href: '/passenger/wallet', label: 'TeslaPay' },
];

export default function PassengerLayout({ children }: LayoutProps<'/passenger'>) {
  return <AppShell nav={PASSENGER_NAV}>{children}</AppShell>;
}
