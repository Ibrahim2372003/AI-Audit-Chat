'use client';

import { useState } from 'react';
import { SeoSuggestionsSchema, type SeoSuggestions } from '@/lib/ai/seo-suggestion-schema';
import { AI_ERROR_COPY, parseAiErrorCode } from '@/lib/ai/errors';

type SeoSuggestionsProps = {
  url: string;
};

export function SeoSuggestions({ url }: SeoSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SeoSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'title' | 'description' | null>(null);

  async function requestSuggestions() {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setCopied(null);

    try {
      const response = await fetch('/api/seo-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        setError('The suggestions service returned an invalid response. Please retry.');
        return;
      }

      if (!response.ok) {
        const responseError =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof body.error === 'string'
            ? body.error
            : 'Suggestions could not be generated. Please retry.';
        const code = parseAiErrorCode(responseError);
        setError(code ? AI_ERROR_COPY[code] : responseError);
        return;
      }

      const parsed = SeoSuggestionsSchema.safeParse(body);
      if (!parsed.success || parsed.data.url !== url.trim()) {
        setError('The suggestions service returned an invalid response. Please retry.');
        return;
      }
      setSuggestions(parsed.data);
    } catch {
      setError('Suggestions could not be generated. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, field: 'title' | 'description') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setError(null);
    } catch {
      setError('Could not copy to clipboard. Select and copy the suggested text instead.');
    }
  }

  return (
    <section
      aria-label="AI SEO suggestions"
      className="border-t border-[#262B36] px-3 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#E7E9EE]">AI metadata suggestions</h3>
        <button
          type="button"
          onClick={requestSuggestions}
          disabled={loading}
          className="rounded-md border border-[#7C9CFF]/50 px-3 py-1.5 text-xs font-semibold text-[#AFC1FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C9CFF] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'Generating…' : suggestions ? 'Regenerate' : 'Generate suggestions'}
        </button>
      </div>

      {loading && (
        <p role="status" className="mt-2 text-xs text-[#8891A3]">
          Fetching the audited page and generating suggestions…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-[#F0665A]">
          {error}
        </p>
      )}
      {suggestions && (
        <div className="mt-3 space-y-3">
          <SuggestionField
            label="SEO title"
            field="title"
            value={suggestions.title}
            copied={copied === 'title'}
            onCopy={copy}
          />
          <SuggestionField
            label="Meta description"
            field="description"
            value={suggestions.description}
            copied={copied === 'description'}
            onCopy={copy}
          />
          <p className="text-xs text-[#8891A3]">
            Suggestions only — nothing has been edited or published on your website.
          </p>
        </div>
      )}
    </section>
  );
}

function SuggestionField({
  label,
  field,
  value,
  copied,
  onCopy,
}: {
  label: string;
  field: 'title' | 'description';
  value: SeoSuggestions['title'];
  copied: boolean;
  onCopy: (text: string, field: 'title' | 'description') => Promise<void>;
}) {
  return (
    <div className="rounded-md border border-[#262B36] bg-[#0B0E14] p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#8891A3]">{label}</h4>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-[#8891A3]">Current</dt>
          <dd className="break-words text-[#C4C9D4]">{value.current ?? 'Not found'}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#8891A3]">Suggested</dt>
          <dd className="break-words text-[#E7E9EE]">{value.suggested}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#8891A3]">Why</dt>
          <dd className="text-[#C4C9D4]">{value.rationale}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => void onCopy(value.suggested, field)}
        className="mt-3 rounded-md border border-[#262B36] px-3 py-1.5 text-xs font-semibold text-[#E7E9EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C9CFF]"
      >
        {copied ? `Copied ${label.toLowerCase()}` : `Copy ${label.toLowerCase()}`}
      </button>
    </div>
  );
}
