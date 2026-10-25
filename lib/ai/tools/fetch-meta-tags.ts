import { tool } from 'ai';
import { z } from 'zod';
import { safeFetchHtml } from '../../security/safe-fetch';
import { findSiteFetchError } from '../errors';
import { extractMetaTags, scoreTags } from './meta-extract';

/**
 * fetchMetaTags
 * -------------
 * Fetches a URL server-side and extracts the SEO-relevant meta tags,
 * then scores completeness against a small fixed checklist.
 *
 * This is the core tool for the FE2 audit capstone: the model calls it
 * whenever the user gives a URL to check, and the UI renders the typed
 * tool-part lifecycle around it (see MetaTagsToolPart.tsx).
 */
export const fetchMetaTags = tool({
  description:
    'Fetch a URL and extract its SEO meta tags (title, description, canonical, ' +
    'robots, Open Graph, Twitter card) plus a 0-100 completeness score. Call this ' +
    'whenever the user asks to audit, check, or scan a specific URL, before commenting on it.',
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .describe('Full URL including protocol, e.g. https://example.com'),
  }),
  execute: ({ url }) => runFetchMetaTags(url),
});

type RunDeps = {
  fetchHtml?: typeof safeFetchHtml;
  log?: (message: string, fields: Record<string, unknown>) => void;
};

/**
 * The tool body, exported so it can be tested with an injected fetcher.
 *
 * All network access goes through safeFetchHtml (SSRF-guarded, bounded). A
 * website failure is rethrown as the typed SiteFetchError it already is: the
 * AI SDK turns that into the tool's `output-error` state, and the route's
 * onError recognises it (lib/ai/errors.ts) and forwards its user-safe message
 * instead of an AI-provider error code. Failures are never swallowed and a
 * failed fetch never produces a score.
 */
export async function runFetchMetaTags(url: string, deps: RunDeps = {}) {
  const fetchHtml = deps.fetchHtml ?? safeFetchHtml;
  const log = deps.log ?? ((message, fields) => console.warn(message, fields));

  let html: string;
  try {
    ({ html } = await fetchHtml(url));
  } catch (error) {
    const site = findSiteFetchError(error);
    if (site) {
      // Server log only: host (not the full URL/query), code, and diagnostic detail.
      log('[fetchMetaTags] site fetch failed', {
        code: site.code,
        host: hostOf(url),
        detail: site.detail,
      });
    }
    throw error;
  }

  const tags = extractMetaTags(html);
  const { score, findings } = scoreTags(tags);

  return {
    url,
    fetchedAt: new Date().toISOString(),
    tags,
    score,
    findings,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid-url';
  }
}
