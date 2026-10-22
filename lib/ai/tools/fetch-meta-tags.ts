import { tool } from 'ai';
import { z } from 'zod';
import { safeFetchHtml } from '../../security/safe-fetch';
import { findSiteFetchError } from '../errors';

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

// ---- extraction & scoring -------------------------------------------------

function pick(html: string, re: RegExp) {
  return html.match(re)?.[1]?.trim() ?? null;
}

function extractMetaTags(html: string) {
  return {
    title: pick(html, /<title[^>]*>([^<]*)<\/title>/i),
    description: pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    canonical: pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    robots: pick(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
    ogTitle: pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i),
    ogImage: pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i),
    twitterCard: pick(html, /<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["']/i),
  };
}

type Tags = ReturnType<typeof extractMetaTags>;

function scoreTags(tags: Tags) {
  const checks: { key: keyof Tags; label: string; weight: number }[] = [
    { key: 'title', label: 'Title tag present', weight: 20 },
    { key: 'description', label: 'Meta description present', weight: 20 },
    { key: 'canonical', label: 'Canonical link present', weight: 15 },
    { key: 'ogTitle', label: 'Open Graph title present', weight: 15 },
    { key: 'ogImage', label: 'Open Graph image present', weight: 15 },
    { key: 'twitterCard', label: 'Twitter card declared', weight: 15 },
  ];

  let score = 0;
  const findings = checks.map((check) => {
    const value = tags[check.key];
    const pass = !!value;
    if (pass) score += check.weight;
    return { label: check.label, pass, value };
  });

  if (tags.title && (tags.title.length < 10 || tags.title.length > 60)) {
    findings.push({
      label: 'Title length within 10-60 chars',
      pass: false,
      value: `${tags.title.length} chars`,
    });
  }

  return { score, findings };
}
