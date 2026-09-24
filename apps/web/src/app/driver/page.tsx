import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Driver' };

export default function DriverHome() {
  return (
    <section className="grid gap-2">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Your Tesla</h1>
      <p className="text-muted-foreground">You are offline. No pool in progress.</p>
    </section>
  );
}
