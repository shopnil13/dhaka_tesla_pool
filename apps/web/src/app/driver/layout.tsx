import { AppShell } from '@/components/app-shell';

export default function DriverLayout({ children }: LayoutProps<'/driver'>) {
  return <AppShell>{children}</AppShell>;
}
