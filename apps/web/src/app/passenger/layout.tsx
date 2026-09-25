import { AppShell } from '@/components/app-shell';

export default function PassengerLayout({ children }: LayoutProps<'/passenger'>) {
  return <AppShell>{children}</AppShell>;
}
