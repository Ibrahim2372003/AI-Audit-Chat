'use client';

export function ConfirmRescanPart({
  part,
  onRespond,
}: {
  part: any;
  onRespond: (confirmed: boolean) => void;
}) {
  // This tool has no `execute`, so it never reaches output-error — it only
  // ever waits (input-available) or resolves once the client answers
  // (output-available), after addToolResult() is called below.
  if (part.state === 'output-available') {
    return (
      <div className="my-2 rounded-lg border border-[#262B36] bg-[#12151C] px-4 py-3 text-sm text-[#8891A3]">
        {part.output.confirmed ? 'Re-scan confirmed.' : 'Re-scan skipped.'}
      </div>
    );
  }

  if (part.state !== 'input-available') return null;

  return (
    <div className="my-2 rounded-lg border border-[#E8B44D]/40 bg-[#12151C] px-4 py-3">
      <p className="text-sm text-[#E7E9EE]">{part.input.reason}</p>
      <p className="mt-1 font-mono text-xs text-[#8891A3]">{part.input.url}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onRespond(true)}
          className="rounded-md bg-[#E8B44D] px-3 py-1.5 text-xs font-semibold text-[#12151C]"
        >
          Re-scan
        </button>
        <button
          onClick={() => onRespond(false)}
          className="rounded-md border border-[#262B36] px-3 py-1.5 text-xs text-[#C4C9D4]"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
