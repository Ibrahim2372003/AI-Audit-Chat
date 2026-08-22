'use client';

import { useEffect } from 'react';

/**
 * Catches render-time / server-component failures for this route segment
 * (a thrown error in a layout, a failed data fetch on the page itself —
 * NOT chat-message errors, which are handled by useChat's `error` object
 * inside AuditChat instead, since those shouldn't unmount the whole page).
 *
 * Duplicate this file into any other route segment that needs its own
 * boundary (e.g. app/audit-chat/error.tsx is provided as a copy).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Route to your logging service here — kept as a single line so it's
    // easy to swap without hunting through the component.
    console.error('[route-error]', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0B0E14] px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F0665A]/10">
        <span className="text-2xl text-[#F0665A]">!</span>
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-[#E7E9EE]">This page hit a snag</h1>
        <p className="max-w-sm text-sm text-[#8891A3]">
          Something broke loading the audit tool itself — not a specific scan.
          Reloading usually clears it.
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-[#7C9CFF] px-4 py-2 text-sm font-semibold text-[#12151C]"
      >
        Reload
      </button>
    </div>
  );
}
