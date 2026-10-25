import { describe, expect, it, vi } from 'vitest';
import { resolveModel } from '../model';
import {
  createSeoSuggestions,
  InvalidSeoSuggestionOutputError,
  parseSeoSuggestionRequest,
  SeoSuggestionConfigurationError,
} from '../seo-suggestions';
import type { SeoSuggestionContentSchema } from '../seo-suggestion-schema';
import type { runFetchMetaTags } from '../tools/fetch-meta-tags';

type Audit = Awaited<ReturnType<typeof runFetchMetaTags>>;

const audit: Audit = {
  url: 'https://example.com/products/widget?campaign=private',
  fetchedAt: '2026-10-25T00:00:00.000Z',
  tags: {
    title: 'Widget | Example',
    description: 'A useful widget for everyday tasks.',
    canonical: 'https://example.com/products/widget',
    robots: null,
    ogTitle: null,
    ogImage: null,
    twitterCard: null,
  },
  score: 55,
  findings: [
    { label: 'Title tag present', pass: true, value: 'Widget | Example' },
    { label: 'Meta description present', pass: true, value: 'A useful widget for everyday tasks.' },
    { label: 'Open Graph title present', pass: false, value: null },
  ],
};

const content: typeof SeoSuggestionContentSchema._output = {
  title: {
    suggested: 'Widget for Everyday Tasks | Example',
    rationale: 'The audited title is brief and can be clearer while keeping its existing topic.',
  },
  description: {
    suggested:
      'Explore a useful widget for everyday tasks. See the product details and find the right fit for your needs.',
    rationale: 'The current description is short; this adds context without asserting new product claims.',
  },
};

function readyModel() {
  return resolveModel({
    AI_PROVIDER: 'google',
    GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
    GEMINI_MODEL: 'test-model',
  });
}

describe('createSeoSuggestions', () => {
  it('returns validated suggestions and takes current values only from the audit', async () => {
    const result = await createSeoSuggestions(audit.url, {
      resolveModel: readyModel,
      fetchAudit: async () => audit,
      generate: async () => content,
    });

    expect(result.url).toBe(audit.url);
    expect(result.title).toEqual({
      current: audit.tags.title,
      ...content.title,
    });
    expect(result.description.current).toBe(audit.tags.description);
  });

  it('rejects malformed structured model output', async () => {
    await expect(
      createSeoSuggestions(audit.url, {
        resolveModel: readyModel,
        fetchAudit: async () => audit,
        generate: async () => ({ title: 'not an object', description: null }),
      }),
    ).rejects.toBeInstanceOf(InvalidSeoSuggestionOutputError);
  });

  it('handles missing metadata as null current values and includes actual findings', async () => {
    const missingMetadata: Audit = {
      ...audit,
      tags: { ...audit.tags, title: null, description: null },
      findings: [
        { label: 'Title tag present', pass: false, value: null },
        { label: 'Meta description present', pass: false, value: null },
      ],
      score: 15,
    };
    const generate = vi.fn(async (_model, receivedAudit) => {
      expect(receivedAudit.tags.title).toBeNull();
      expect(receivedAudit.findings).toEqual(missingMetadata.findings);
      return content;
    });

    const result = await createSeoSuggestions(audit.url, {
      resolveModel: readyModel,
      fetchAudit: async () => missingMetadata,
      generate,
    });

    expect(result.title.current).toBeNull();
    expect(result.description.current).toBeNull();
  });

  it('rejects invalid URL input before attempting a fetch', () => {
    expect(parseSeoSuggestionRequest({ url: 'file:///etc/passwd' })).toBeNull();
    expect(parseSeoSuggestionRequest({ url: 'https://user:pass@example.com' })).toBeNull();
    expect(parseSeoSuggestionRequest({ url: `https://example.com/${'x'.repeat(2048)}` })).toBeNull();
    expect(parseSeoSuggestionRequest({ url: 'https://example.com', extra: 'ignored?' })).toBeNull();
    expect(parseSeoSuggestionRequest({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com',
    });
  });

  it('reports model configuration errors without fetching the page', async () => {
    const fetchAudit = vi.fn();

    await expect(
      createSeoSuggestions(audit.url, {
        resolveModel: () => ({
          status: 'misconfigured',
          detail: 'GEMINI_MODEL is not set',
        }),
        fetchAudit,
      }),
    ).rejects.toBeInstanceOf(SeoSuggestionConfigurationError);
    expect(fetchAudit).not.toHaveBeenCalled();
  });

  it('propagates provider failures for the route to redact and report', async () => {
    const providerError = new Error('provider unavailable');

    await expect(
      createSeoSuggestions(audit.url, {
        resolveModel: readyModel,
        fetchAudit: async () => audit,
        generate: async () => {
          throw providerError;
        },
      }),
    ).rejects.toBe(providerError);
  });
});
