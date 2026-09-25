import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Your rides' };

export default function PassengerHome() {
  return (
    <section className="grid gap-2">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Your rides</h1>
      <p className="text-muted-foreground">You have no active ride.</p>
    </section>
  );
}
