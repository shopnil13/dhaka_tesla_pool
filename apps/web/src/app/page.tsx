import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div className="grid gap-4">
        <p className="text-sm font-medium text-muted-foreground">Banani · Gulshan · Mohakhali</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Dhaka Tesla Pool</h1>
        <p className="text-lg text-muted-foreground">
          Share a seat. Split the fare. Survive Dhaka traffic.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/register">Create a passenger account</Link>
        </Button>
      </div>
    </main>
  );
}
