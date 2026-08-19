type Finding = { label: string; pass: boolean; value: string | null };

type FetchMetaTagsResult = {
  url: string;
  score: number;
  tags: Record<string, string | null>;
  findings: Finding[];
};

export function MetaTagsFindingsCard({ result }: { result: Partial<FetchMetaTagsResult> }) {
  const findings = Array.isArray(result.findings) ? result.findings : null;
  const score = typeof result.score === 'number' ? result.score : null;

  // A tool can "succeed" (output-available) and still hand back a shape the
  // UI wasn't built for — e.g. a schema drift on the model side. Fail into
  // a designed notice here instead of crashing the message list.
  if (!findings || score === null) {
    return (
      <div className="mt-2 rounded-md border border-[#E8B44D]/40 bg-[#E8B44D]/10 px-3 py-2 text-sm text-[#E8B44D]">
        Got a result back, but it wasn't in the expected shape — nothing to show.
      </div>
    );
  }

  const scoreColor = score >= 80 ? '#4FD1A5' : score >= 50 ? '#E8B44D' : '#F0665A';
  const nothingFound = findings.every((f) => !f.pass);

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-[#262B36]">
      <div className="flex items-center justify-between border-b border-[#262B36] bg-[#171B24] px-3 py-2">
        <span className="truncate font-mono text-sm text-[#E7E9EE]">{result.url}</span>
        <span
          className="ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ color: scoreColor, backgroundColor: `${scoreColor}1A` }}
        >
          {score}/100
        </span>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {findings.map((f, i) => (
            <tr key={i} className="border-b border-[#1D2230] last:border-0">
              <td className="w-6 px-3 py-1.5 text-center">
                {f.pass ? (
                  <span className="text-[#4FD1A5]">✓</span>
                ) : (
                  <span className="text-[#F0665A]">✕</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-[#C4C9D4]">{f.label}</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs text-[#8891A3]">
                {f.value ? truncate(f.value, 40) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nothingFound && (
        <p className="border-t border-[#1D2230] px-3 py-2 text-xs text-[#8891A3]">
          No SEO meta tags found on this page — that's a real result, not a
          fetch problem. Worth checking if the page renders content client-side.
        </p>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
