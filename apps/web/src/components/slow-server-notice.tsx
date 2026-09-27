'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const SLOW_AFTER_MS = 4000;

/**
 * The API runs on a free host that sleeps after 15 idle minutes, and the
 * first request after that takes up to a minute. If anything is still
 * loading after a few seconds, say why instead of leaving a silent skeleton.
 */
export function SlowServerNotice() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [busy]);

  if (!busy || !slow) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg border bg-background px-4 py-3 text-sm shadow-lg"
    >
      Waking up Bullet&apos;s engine… The free server sleeps when idle, so the first request can
      take up to a minute.
    </div>
  );
}
