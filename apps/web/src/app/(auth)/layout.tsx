import Link from 'next/link';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" className="font-heading text-xl font-semibold tracking-tight">
        Dhaka Tesla Pool
      </Link>
      {children}
    </main>
  );
}
