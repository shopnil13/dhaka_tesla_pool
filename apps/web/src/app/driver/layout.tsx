import { AppShell, type NavItem } from '@/components/app-shell';

const DRIVER_NAV: NavItem[] = [
  { href: '/driver', label: 'Drive' },
  { href: '/driver/history', label: 'History' },
];

export default function DriverLayout({ children }: LayoutProps<'/driver'>) {
  return <AppShell nav={DRIVER_NAV}>{children}</AppShell>;
}
