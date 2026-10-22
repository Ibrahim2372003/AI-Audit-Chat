import { describe, expect, it } from 'vitest';
import { runFetchMetaTags } from '../fetch-meta-tags';
import { SiteFetchError } from '../../../security/site-fetch-error';
import { toClientErrorText } from '../../errors';

const FULL_HTML = `<html><head>
<title>A reasonably sized page title</title>
<meta name="description" content="A description">
<link rel="canonical" href="https://example.com/">
<meta property="og:title" content="OG title">
<meta property="og:image" content="https://example.com/i.png">
<meta name="twitter:card" content="summary">
</head><body></body></html>`;

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

describe('runFetchMetaTags: success path is unchanged', () => {
  it('extracts and scores tags from fetched HTML without touching the network', async () => {
    const result = await runFetchMetaTags('https://example.com/', {
      fetchHtml: async () => ({ html: FULL_HTML, finalUrl: 'https://example.com/', truncated: false }),
    });
    expect(result.url).toBe('https://example.com/');
    expect(result.score).toBe(100);
    expect(result.tags.title).toBe('A reasonably sized page title');
    expect(result.findings.every((f) => f.pass)).toBe(true);
  });

  it('reports missing metadata as a zero score, not as an error', async () => {
    const result = await runFetchMetaTags('https://example.com/', {
      fetchHtml: async () => ({
        html: '<html><head></head><body>no tags</body></html>',
        finalUrl: 'https://example.com/',
        truncated: false,
      }),
    });
    expect(result.score).toBe(0);
    expect(result.tags.title).toBeNull();
    expect(result.findings.every((f) => !f.pass)).toBe(true);
  });
});

describe('runFetchMetaTags: website failures', () => {
  it('rethrows the typed error unchanged, never producing a score', async () => {
    const original = new SiteFetchError('http_error', 'Fetch failed: 429 Too Many Requests', 'status 429');
    const error = await rejection(
      runFetchMetaTags('https://example.com/page?token=SECRET', {
        fetchHtml: async () => {
          throw original;
        },
        log: () => {},
      }),
    );
    expect(error).toBe(original);
  });

  it('logs only host, code and detail for the operator, never the full URL or query', async () => {
    const logged: Array<{ message: string; fields: Record<string, unknown> }> = [];
    await rejection(
      runFetchMetaTags('https://example.com/private/path?token=SECRET', {
        fetchHtml: async () => {
          throw new SiteFetchError('timeout', "The site didn't respond within 8 seconds.", 'deadline exceeded');
        },
        log: (message, fields) => logged.push({ message, fields }),
      }),
    );
    expect(logged).toHaveLength(1);
    expect(logged[0].fields).toEqual({ code: 'timeout', host: 'example.com', detail: 'deadline exceeded' });
    expect(JSON.stringify(logged)).not.toContain('SECRET');
    expect(JSON.stringify(logged)).not.toContain('/private/path');
  });

  it('does not log unexpected non-website errors as site failures, and still rethrows them', async () => {
    const logged: unknown[] = [];
    const boom = new TypeError('unexpected bug');
    const error = await rejection(
      runFetchMetaTags('https://example.com/', {
        fetchHtml: async () => {
          throw boom;
        },
        log: (...args) => logged.push(args),
      }),
    );
    expect(error).toBe(boom);
    expect(logged).toHaveLength(0);
  });

  it.each([
    ['http_error', 'Fetch failed: 404 Not Found'],
    ['http_error', 'Fetch failed: 429 Too Many Requests'],
    ['http_error', 'Fetch failed: 503 Service Unavailable'],
    ['not_html', 'Expected HTML, got content-type "application/pdf"'],
    ['timeout', "The site didn't respond within 8 seconds."],
    ['blocked_destination', "That address can't be audited: private, internal, and non-standard-port destinations are blocked."],
  ])('tool failure %s reaches the client as its own message, not an AI-provider code', async (code, message) => {
    const error = await rejection(
      runFetchMetaTags('https://example.com/', {
        fetchHtml: async () => {
          throw new SiteFetchError(code as any, message);
        },
        log: () => {},
      }),
    );
    // This is exactly what the route's onError forwards to the tool card.
    expect(toClientErrorText(error)).toBe(message);
    expect(toClientErrorText(error)).not.toMatch(/^ai_error:/);
  });
});
