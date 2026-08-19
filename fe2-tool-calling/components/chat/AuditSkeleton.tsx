/**
 * Mirrors MetaTagsToolPart's Shell + MetaTagsFindingsCard dimensions exactly
 * (same padding, same row height, same border) so swapping skeleton -> real
 * content doesn't shift layout. If you resize the real card, resize this too.
 */
export function AuditSkeleton() {
  return (
    <div className="my-2 rounded-lg border border-[#262B36] bg-[#12151C] px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[#8891A3]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#3A4152]" />
        Fetching meta tags
      </div>

      <div className="mt-2 overflow-hidden rounded-md border border-[#262B36]">
        <div className="flex items-center justify-between border-b border-[#262B36] bg-[#171B24] px-3 py-2">
          <div className="h-4 w-40 animate-pulse rounded bg-[#1D2230]" />
          <div className="h-4 w-12 animate-pulse rounded-full bg-[#1D2230]" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-[#1D2230] px-3 py-1.5 last:border-0"
          >
            <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-[#1D2230]" />
            <div className="h-3 flex-1 animate-pulse rounded bg-[#1D2230]" />
            <div className="h-3 w-16 shrink-0 animate-pulse rounded bg-[#1D2230]" />
          </div>
        ))}
      </div>
    </div>
  );
}
