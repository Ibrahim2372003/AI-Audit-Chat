const EXAMPLES = ['https://vercel.com', 'https://stripe.com', 'https://nextjs.org'];

export function EmptyState({ onPick }: { onPick: (url: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-[#262B36] px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C9CFF]/10">
        <span className="text-lg text-[#7C9CFF]">◎</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-[#E7E9EE]">No audits yet</p>
        <p className="text-sm text-[#8891A3]">
          Paste a URL above, or try one of these:
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((url) => (
          <button
            key={url}
            onClick={() => onPick(url)}
            className="rounded-full border border-[#262B36] px-3 py-1.5 font-mono text-xs text-[#C4C9D4] transition-colors hover:border-[#7C9CFF] hover:text-[#7C9CFF]"
          >
            {url}
          </button>
        ))}
      </div>
    </div>
  );
}
