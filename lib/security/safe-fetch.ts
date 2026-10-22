import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import type { Readable, Transform } from 'node:stream';
import * as zlib from 'node:zlib';
import { assertAllowedUrl, DEFAULT_ALLOWED_PORTS, isPublicAddress } from './ssrf';
import {
  SiteFetchError,
  SITE_FETCH_MESSAGES,
  sanitizeForMessage,
  timeoutMessage,
} from './site-fetch-error';

/**
 * safeFetchHtml: fetch a user-supplied URL for auditing without letting it
 * reach internal networks.
 *
 * Why not `fetch()`?  Validating a URL and then calling fetch() leaves two gaps:
 *  - DNS rebinding / TOCTOU: fetch() resolves the name again, and an attacker's
 *    DNS server can answer "public" for our check and "10.0.0.5" for the
 *    connection.
 *  - Redirects: a public URL can 302 to http://169.254.169.254/.
 * So this uses node:http(s) with a custom `lookup`. The lookup resolves the
 * name, rejects the connection if ANY returned address is non-public, and
 * hands the socket only the validated addresses. The address that was checked
 * is therefore the address that is connected to, once per connection.
 * Redirects are followed manually and every hop is re-validated (URL policy
 * first, then the connect-time lookup).
 *
 * Limits (all defaults, overridable only via `deps`, which exists for tests):
 *  - 8 s total deadline across all hops and the body read
 *  - 5 redirects
 *  - 2 MiB of decoded body; the body is truncated, not rejected, because the
 *    SEO tags we parse live near the top of the document
 *  - ports 80/443 only; http/https only; no credentials in URLs
 *
 * Known limitations are listed in README.md ("Known gaps").
 */

export const FETCH_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'FlyRank-Audit-Bot/1.0 (+https://flyrank.ai)';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** Everything here defaults to the secure production value. For tests only. */
export type SafeFetchDeps = {
  resolve?: Resolver;
  isPublicAddress?: (address: string) => boolean;
  allowedPorts?: readonly number[];
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
};

export type SafeFetchResult = {
  html: string;
  finalUrl: string;
  /** True when the body hit the size cap and was cut short. */
  truncated: boolean;
};

const defaultResolve: Resolver = async (hostname) => {
  const results = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: (r.family === 6 ? 6 : 4) as 4 | 6 }));
};

/**
 * Builds the `lookup` handed to http(s).request. Node (>=20, autoSelectFamily)
 * calls it with `{ all: true }` and expects an array; older call styles expect
 * (address, family). Both shapes are supported.
 */
function createGuardedLookup(resolve: Resolver, isPublic: (address: string) => boolean) {
  return (hostname: string, options: any, callback: any): void => {
    const done: (...args: any[]) => void = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' || !options ? {} : options;

    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0) {
          done(Object.assign(new Error('no addresses'), { code: 'ENOTFOUND' }));
          return;
        }
        if (addresses.some((a) => !isPublic(a.address))) {
          done(
            new SiteFetchError(
              'blocked_destination',
              SITE_FETCH_MESSAGES.blocked_destination,
              'hostname resolved to a non-public address',
            ),
          );
          return;
        }
        const wanted =
          opts.family === 4 || opts.family === 6
            ? addresses.filter((a) => a.family === opts.family)
            : addresses;
        if (wanted.length === 0) {
          done(Object.assign(new Error('no addresses for family'), { code: 'ENOTFOUND' }));
          return;
        }
        if (opts.all) done(null, wanted);
        else done(null, wanted[0].address, wanted[0].family);
      },
      (error) => done(error),
    );
  };
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function requestOnce(
  url: URL,
  lookup: ReturnType<typeof createGuardedLookup>,
  signal: AbortSignal,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;
    let req: http.ClientRequest;
    const onAbort = () => req.destroy(new Error('aborted'));

    req = lib.request(
      {
        protocol: url.protocol,
        hostname: stripBrackets(url.hostname),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        agent: false,
        lookup,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        signal.removeEventListener('abort', onAbort);
        resolve(res);
      },
    );
    signal.addEventListener('abort', onAbort, { once: true });
    req.on('error', (error) => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
    req.end();
  });
}

async function readBody(
  res: http.IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  const encoding = String(
    res.headers['content-encoding'] ?? 'identity',
  )
    .trim()
    .toLowerCase();

  let decompressor: Transform | undefined;

  if (encoding === 'gzip' || encoding === 'x-gzip') {
    decompressor = zlib.createGunzip();
  } else if (encoding === 'deflate') {
    decompressor = zlib.createInflate();
  } else if (encoding === 'br') {
    decompressor = zlib.createBrotliDecompress();
  } else if (encoding !== 'identity' && encoding !== '') {
    res.destroy();
    throw new SiteFetchError(
      'bad_response',
      SITE_FETCH_MESSAGES.bad_response,
      `unsupported content-encoding ${sanitizeForMessage(encoding, 20)}`,
    );
  }

  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  const source: Readable = decompressor ?? res;

  const onAbort = () => {
    res.destroy(new Error('aborted'));
    source.destroy(new Error('aborted'));
  };

  signal.addEventListener('abort', onAbort, { once: true });

  try {
    if (decompressor) {
      const onSourceError = (error: Error) => decompressor?.destroy(error);
      res.once('error', onSourceError);
      res.pipe(decompressor);

      try {
        for await (const chunk of decompressor) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const room = maxBytes - total;

          if (buf.length > room) {
            if (room > 0) chunks.push(buf.subarray(0, room));
            total += Math.max(0, room);
            truncated = true;
            res.unpipe(decompressor);
            res.destroy();
            decompressor.destroy();
            break;
          }

          chunks.push(buf);
          total += buf.length;
        }
      } catch (error) {
        if (!truncated) throw error;
      } finally {
        res.removeListener('error', onSourceError);
      }
    } else {
      for await (const chunk of source) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const room = maxBytes - total;

        if (buf.length > room) {
          if (room > 0) chunks.push(buf.subarray(0, room));
          total += Math.max(0, room);
          truncated = true;
          res.destroy();
          break;
        }

        chunks.push(buf);
        total += buf.length;
      }
    }
  } catch (error) {
    if (signal.aborted) throw error;

    if (
      encoding === 'gzip' ||
      encoding === 'x-gzip' ||
      encoding === 'deflate' ||
      encoding === 'br'
    ) {
      throw new SiteFetchError(
        'bad_response',
        SITE_FETCH_MESSAGES.bad_response,
        'compressed response could not be decoded',
      );
    }

    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    source.destroy();
    res.destroy();
  }

  return {
    text: new TextDecoder('utf-8').decode(Buffer.concat(chunks)),
    truncated,
  };
}

/** Maps anything thrown during the fetch to a typed, user-safe SiteFetchError. */
function toSiteFetchError(error: unknown, timedOut: boolean, timeoutMs: number): SiteFetchError {
  if (error instanceof SiteFetchError) return error;
  // Brand check too: survives duplicated module instances.
  if (error && typeof (error as any).siteFetchCode === 'string') return error as SiteFetchError;

  if (timedOut) {
    return new SiteFetchError('timeout', timeoutMessage(timeoutMs), 'deadline exceeded');
  }
  const code = String((error as any)?.code ?? '');
  const detail = code || (error as Error)?.name || 'unknown';

  if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ENODATA', 'ESERVFAIL'].includes(code)) {
    return new SiteFetchError('dns_failed', SITE_FETCH_MESSAGES.dns_failed, detail);
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    return new SiteFetchError('timeout', timeoutMessage(timeoutMs), detail);
  }
  if (/^(Z_|ERR_BROTLI)/.test(code)) {
    return new SiteFetchError('bad_response', SITE_FETCH_MESSAGES.bad_response, detail);
  }
  return new SiteFetchError('network_error', SITE_FETCH_MESSAGES.network_error, detail);
}

export async function safeFetchHtml(
  rawUrl: string,
  deps: SafeFetchDeps = {},
): Promise<SafeFetchResult> {
  const policy = {
    allowedPorts: deps.allowedPorts ?? DEFAULT_ALLOWED_PORTS,
    isPublicAddress: deps.isPublicAddress ?? isPublicAddress,
  };
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBodyBytes = deps.maxBodyBytes ?? MAX_BODY_BYTES;
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;
  const lookup = createGuardedLookup(deps.resolve ?? defaultResolve, policy.isPublicAddress);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let current = assertAllowedUrl(rawUrl, policy);

    for (let hop = 0; ; hop += 1) {
      const res = await requestOnce(current, lookup, controller.signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;

      if (REDIRECT_STATUSES.has(status) && location) {
        res.destroy();
        if (hop >= maxRedirects) {
          throw new SiteFetchError(
            'too_many_redirects',
            SITE_FETCH_MESSAGES.too_many_redirects,
            `exceeded ${maxRedirects}`,
          );
        }
        let next: URL;
        try {
          next = new URL(String(location), current);
        } catch {
          throw new SiteFetchError('bad_response', SITE_FETCH_MESSAGES.bad_response, 'bad Location');
        }
        // Re-validate every hop before connecting to it.
        current = assertAllowedUrl(next, policy);
        continue;
      }

      if (status < 200 || status >= 300) {
        res.destroy();
        const statusText = sanitizeForMessage(res.statusMessage ?? '', 60);
        throw new SiteFetchError(
          'http_error',
          `Fetch failed: ${status} ${statusText}`.trim(),
          `status ${status}`,
        );
      }

      const rawContentType = String(res.headers['content-type'] ?? '');
      if (!rawContentType.includes('text/html')) {
        res.destroy();
        throw new SiteFetchError(
          'not_html',
          `Expected HTML, got content-type "${sanitizeForMessage(rawContentType) || 'unknown'}"`,
          'content-type check',
        );
      }

      const { text, truncated } = await readBody(res, maxBodyBytes, controller.signal);
      return { html: text, finalUrl: current.toString(), truncated };
    }
  } catch (error) {
    throw toSiteFetchError(error, timedOut, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}
