'use client';

import type { ReactNode } from 'react';
import { MetaTagsFindingsCard } from './MetaTagsFindingsCard';

/**
 * Four states, four different questions answered:
 *  - input-streaming  -> "what is it doing?"     (drafting the request)
 *  - input-available   -> "with what input?"      (fetching a known URL)
 *  - output-available  -> "what came back?"       (the findings card)
 *  - output-error       -> "what went wrong?"      (designed failure state)
 *
 * Each gets its own status color + shape, and the shell crossfades between
 * states instead of hard-swapping (see the `transition-opacity` on Shell).
 */
export function MetaTagsToolPart({ part }: { part: any }) {
  switch (part.state) {
    case 'input-streaming':
      return <StreamingState part={part} />;
    case 'input-available':
      return <FetchingState part={part} />;
    case 'output-available':
      return <ResultState part={part} />;
    case 'output-error':
      return <ErrorState part={part} />;
    default:
      return null;
  }
}

function Shell({
  dot,
  label,
  role = 'status',
  children,
}: {
  dot: ReactNode;
  label: string;
  role?: 'status' | 'alert';
  children?: ReactNode;
}) {
  return (
    <div
      role={role}
      aria-label={label}
      className="my-2 animate-[fadeIn_200ms_ease-out] rounded-lg border border-[#262B36] bg-[#12151C] px-4 py-3"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#8891A3]">
        {dot}
        {label}
      </div>
      {children}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function StreamingState({ part }: { part: any }) {
  const partialUrl: string | undefined = part.input?.url;
  return (
    <Shell
      dot={<span className="h-2 w-2 animate-pulse rounded-full bg-[#7C9CFF]" />}
      label="Drafting audit request"
    >
      {partialUrl ? (
        <div className="mt-2 font-mono text-sm text-[#7C9CFF]">{partialUrl}</div>
      ) : (
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-[#1D2230]" />
      )}
    </Shell>
  );
}

function FetchingState({ part }: { part: any }) {
  return (
    <Shell
      dot={<span className="h-2 w-2 rounded-full bg-[#E8B44D]" />}
      label="Fetching meta tags"
    >
      <div className="mt-2 flex items-center gap-2 font-mono text-sm text-[#E7E9EE]">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#E8B44D] border-t-transparent" />
        {part.input?.url}
      </div>
    </Shell>
  );
}

function ResultState({ part }: { part: any }) {
  return (
    <Shell
      dot={<span className="h-2 w-2 rounded-full bg-[#4FD1A5]" />}
      label="Audit complete"
    >
      <MetaTagsFindingsCard result={part.output} />
    </Shell>
  );
}

function ErrorState({ part }: { part: any }) {
  return (
    <Shell
      dot={<span className="h-2 w-2 rounded-full bg-[#F0665A]" />}
      label="Fetch failed"
      role="alert"
    >
      <div className="mt-2 rounded-md border border-[#F0665A]/40 bg-[#F0665A]/10 px-3 py-2">
        <p className="font-mono text-sm text-[#F0665A]">
          {part.errorText ?? 'Unknown error'}
        </p>
        <p className="mt-1 text-xs text-[#8891A3]">
          The site may be unreachable, blocking bots, or not returning HTML.
          Check the URL and ask again to retry.
        </p>
      </div>
    </Shell>
  );
}
