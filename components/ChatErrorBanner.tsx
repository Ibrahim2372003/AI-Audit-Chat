'use client';

import { useState } from 'react';
import { AI_ERROR_COPY, parseAiErrorCode } from '@/lib/ai/errors';

/**
 * Retries the failed message only — useChat's regenerate() re-sends the
 * last user turn, it doesn't touch earlier history. Guards against a
 * double click firing two retries by disabling itself the instant it's
 * pressed and re-enabling only once `error` actually clears.
 */
export function ChatErrorBanner({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  const message = classify(error);

  return (
    <div
      role="alert"
      className="my-2 flex items-center justify-between gap-3 rounded-lg border border-[#F0665A]/40 bg-[#F0665A]/10 px-4 py-3 transition-opacity duration-200"
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#F0665A]" />
        <p className="text-sm text-[#E7E9EE]">{message}</p>
      </div>
      <button
        onClick={() => {
          if (retrying) return;
          setRetrying(true);
          onRetry();
          // If the retry itself fails again, a fresh `error` comes in and
          // this component remounts with retrying reset to false.
          setTimeout(() => setRetrying(false), 1500);
        }}
        disabled={retrying}
        className="shrink-0 rounded-md bg-[#F0665A] px-3 py-1.5 text-xs font-semibold text-[#12151C] disabled:opacity-50"
      >
        {retrying ? 'Retrying…' : 'Retry last message'}
      </button>
    </div>
  );
}

function classify(error: Error): string {
  // Provider failures arrive from the server as a fixed `ai_error:<code>`
  // token (see lib/ai/errors.ts), never as the provider's raw message.
  const code = parseAiErrorCode(error.message);
  if (code) return AI_ERROR_COPY[code];

  // Legacy keyword matching, kept for errors that don't carry a code (the
  // route's own 429/400 JSON bodies, network failures before a response).
  const msg = error.message?.toLowerCase() ?? '';
  if (msg.includes('credit balance') || msg.includes('insufficient_quota')) {
    return 'The audit service has no API credits available. Check billing for the AI provider, then retry.';
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return "You're sending messages faster than the audit service can keep up. Wait a moment and retry.";
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return "Lost the connection mid-response. Your last message wasn't answered.";
  }
  return 'That message failed to send.';
}
