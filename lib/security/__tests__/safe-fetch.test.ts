import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { safeFetchHtml, type ResolvedAddress, type SafeFetchDeps } from '../safe-fetch';

/**
 * These tests use real sockets against servers on 127.0.0.1 and never contact
 * an external site. Loopback is normally blocked, so tests that need to reach
 * the local server inject a resolver (site.test -> 127.0.0.1) and a policy that
 * treats ONLY 127.0.0.1 as "public". Tests of the default policy inject
 * nothing and assert that loopback is refused WITHOUT the server seeing a hit.
 */

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const servers: http.Server[] = [];

async function startServer(handler: Handler) {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    handler(req, res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { port, hits, server };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

/** site.test (and anything else) -> 127.0.0.1, and only 127.0.0.1 counts as public. */
function localDeps(port: number, extra: SafeFetchDeps = {}): SafeFetchDeps {
  return {
    resolve: async () => [{ address: '127.0.0.1', family: 4 }],
    isPublicAddress: (address) => address === '127.0.0.1',
    allowedPorts: [port],
    timeoutMs: 2000,
    ...extra,
  };
}

const HTML = '<html><head><title>Hello there</title></head><body>ok</body></html>';
const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8' };

describe('safeFetchHtml: success and redirects', () => {
  it('returns the HTML and final URL for a normal page', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, htmlHeaders);
      res.end(HTML);
    });
    const result = await safeFetchHtml(`http://site.test:${port}/page`, localDeps(port));
    expect(result.html).toBe(HTML);
    expect(result.truncated).toBe(false);
    expect(result.finalUrl).toBe(`http://site.test:${port}/page`);
  });

  it('follows a redirect chain and reports the final URL', async () => {
    const { port, hits } = await startServer((req, res) => {
      if (req.url === '/a') {
        res.writeHead(301, { Location: '/b' });
        res.end();
      } else if (req.url === '/b') {
        res.writeHead(302, { Location: `http://site.test:${port}/final` });
        res.end();
      } else {
        res.writeHead(200, htmlHeaders);
        res.end(HTML);
      }
    });
    const result = await safeFetchHtml(`http://site.test:${port}/a`, localDeps(port));
    expect(result.html).toBe(HTML);
    expect(result.finalUrl).toBe(`http://site.test:${port}/final`);
    expect(hits).toEqual(['/a', '/b', '/final']);
  });

  it('stops a redirect loop with too_many_redirects', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    });
    const error = await rejection(
      safeFetchHtml(`http://site.test:${port}/loop`, localDeps(port, { maxRedirects: 3 })),
    );
    expect(error.siteFetchCode).toBe('too_many_redirects');
  });

  it('treats a bad Location header as an unreadable response', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(302, { Location: 'http://[' });
      res.end();
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('bad_response');
  });
});

describe('safeFetchHtml: SSRF protections', () => {
  it('blocks a redirect to a link-local metadata address (IP literal) before connecting', async () => {
    const { port, hits } = await startServer((_req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    const error = await rejection(
      safeFetchHtml(
        `http://site.test:${port}/`,
        localDeps(port, { allowedPorts: [port, 80] }),
      ),
    );
    expect(error.siteFetchCode).toBe('blocked_destination');
    expect(error.detail).toBe('non-public ip literal');
    expect(hits).toEqual(['/']);
  });

  it('blocks a redirect to a hostname that resolves to a private address', async () => {
    const { port, hits } = await startServer((_req, res) => {
      res.writeHead(302, { Location: `http://internal.test:${port}/admin` });
      res.end();
    });
    const resolve = async (host: string): Promise<ResolvedAddress[]> =>
      host === 'internal.test'
        ? [{ address: '10.0.0.5', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }];
    const error = await rejection(
      safeFetchHtml(`http://site.test:${port}/`, localDeps(port, { resolve })),
    );
    expect(error.siteFetchCode).toBe('blocked_destination');
    expect(error.detail).toBe('hostname resolved to a non-public address');
    // Only the first hop ever reached a server.
    expect(hits).toEqual(['/']);
  });

  it('re-validates DNS on every connection (rebinding): public first, private second', async () => {
    const { port, hits } = await startServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(302, { Location: `http://rebind.test:${port}/second` });
        res.end();
      } else {
        res.writeHead(200, htmlHeaders);
        res.end(HTML);
      }
    });
    let lookups = 0;
    const resolve = async (): Promise<ResolvedAddress[]> => {
      lookups += 1;
      return lookups === 1
        ? [{ address: '127.0.0.1', family: 4 }] // answer that passes our policy
        : [{ address: '10.0.0.5', family: 4 }]; // the attacker's "second answer"
    };
    const error = await rejection(
      safeFetchHtml(`http://rebind.test:${port}/`, localDeps(port, { resolve })),
    );
    expect(error.siteFetchCode).toBe('blocked_destination');
    // One resolution per connection, each checked: no cached trust between hops.
    expect(lookups).toBe(2);
    expect(hits).toEqual(['/']);
  });

  it('rejects a hostname when ANY resolved address is non-public (mixed answers)', async () => {
    const { port, hits } = await startServer((_req, res) => {
      res.writeHead(200, htmlHeaders);
      res.end(HTML);
    });
    const resolve = async (): Promise<ResolvedAddress[]> => [
      { address: '127.0.0.1', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    const error = await rejection(
      safeFetchHtml(`http://mixed.test:${port}/`, localDeps(port, { resolve })),
    );
    expect(error.siteFetchCode).toBe('blocked_destination');
    expect(hits).toEqual([]);
  });

  it('with the DEFAULT policy, refuses loopback targets and the server sees no request', async () => {
    const { port, hits } = await startServer((_req, res) => {
      res.writeHead(200, htmlHeaders);
      res.end('secret internal page');
    });
    for (const url of [
      `http://127.0.0.1:${port}/`,
      `http://localhost:${port}/`,
      `http://[::ffff:127.0.0.1]:${port}/`,
    ]) {
      const error = await rejection(safeFetchHtml(url));
      expect(error.siteFetchCode).toBe('blocked_destination');
    }
    // Even if the port were allowed, the loopback IP is still refused.
    const portAllowed = await rejection(
      safeFetchHtml(`http://127.0.0.1:${port}/`, { allowedPorts: [port] }),
    );
    expect(portAllowed.siteFetchCode).toBe('blocked_destination');
    expect(hits).toEqual([]);
  });

  it('rejects invalid URLs without any network activity', async () => {
    for (const url of ['not a url', 'ftp://example.com/', 'http://user:pw@example.com/']) {
      const error = await rejection(safeFetchHtml(url));
      expect(error.siteFetchCode).toBe('invalid_url');
    }
  });

  it('never leaks addresses or ports in user-facing messages', async () => {
    const closed = await startServer((_req, res) => res.end());
    const closedPort = closed.port;
    await new Promise<void>((resolve) => {
      closed.server.closeAllConnections();
      closed.server.close(() => resolve());
    });

    // Thunks, so each attempt starts only when it is awaited (no stray
    // unhandled rejections while an earlier case is still being checked).
    const cases: Array<() => Promise<unknown>> = [
      () => safeFetchHtml('http://169.254.169.254/'),
      () => safeFetchHtml(`http://site.test:${closedPort}/`, localDeps(closedPort)), // connection refused
      () =>
        safeFetchHtml('http://nxdomain.test/', {
          resolve: async () => {
            throw Object.assign(new Error('getaddrinfo ENOTFOUND nxdomain.test'), {
              code: 'ENOTFOUND',
            });
          },
        }),
    ];
    for (const attempt of cases) {
      const error = await rejection(attempt());
      expect(error.message).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
      expect(error.message).not.toMatch(/ECONN|ENOTFOUND|getaddrinfo|127\.0\.0\.1/);
      expect(error.message).not.toContain(String(closedPort));
    }
  });
});

describe('safeFetchHtml: failure classification', () => {
  it('reports a DNS failure as dns_failed', async () => {
    const error = await rejection(
      safeFetchHtml('http://nxdomain.test/', {
        resolve: async () => {
          throw Object.assign(new Error('x'), { code: 'ENOTFOUND' });
        },
      }),
    );
    expect(error.siteFetchCode).toBe('dns_failed');
  });

  it('reports connection refused as network_error, not a timeout or provider error', async () => {
    const closed = await startServer((_req, res) => res.end());
    const port = closed.port;
    await new Promise<void>((resolve) => {
      closed.server.closeAllConnections();
      closed.server.close(() => resolve());
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('network_error');
  });

  it.each([
    [404, 'Not Found'],
    [403, 'Forbidden'],
    [429, 'Too Many Requests'],
    [500, 'Internal Server Error'],
    [503, 'Service Unavailable'],
  ])('reports HTTP %i as http_error with the existing message format', async (status, text) => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(status, text, htmlHeaders);
      res.end('nope');
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('http_error');
    expect(error.message).toBe(`Fetch failed: ${status} ${text}`);
  });

  it('rejects non-HTML content with the existing message format', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"a":1}');
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('not_html');
    expect(error.message).toBe('Expected HTML, got content-type "application/json"');
  });

  it('reports a missing content-type as "unknown"', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200);
      res.end('plain');
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('not_html');
    expect(error.message).toBe('Expected HTML, got content-type "unknown"');
  });
});

describe('safeFetchHtml: timeouts', () => {
  it('times out when the server accepts but never responds', async () => {
    const { port } = await startServer(() => {
      /* never respond */
    });
    const started = Date.now();
    const error = await rejection(
      safeFetchHtml(`http://site.test:${port}/`, localDeps(port, { timeoutMs: 200 })),
    );
    expect(error.siteFetchCode).toBe('timeout');
    expect(error.message).toContain('200 ms');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('times out when the body stalls after the headers (slow-loris style)', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, htmlHeaders);
      res.write('<html><head>');
      /* then stall forever */
    });
    const error = await rejection(
      safeFetchHtml(`http://site.test:${port}/`, localDeps(port, { timeoutMs: 200 })),
    );
    expect(error.siteFetchCode).toBe('timeout');
  });

  it('applies one deadline across a whole redirect chain', async () => {
    const { port } = await startServer((req, res) => {
      if (req.url === '/') {
        setTimeout(() => {
          res.writeHead(302, { Location: '/slow' });
          res.end();
        }, 120);
      } // /slow never answers
    });
    const error = await rejection(
      safeFetchHtml(`http://site.test:${port}/`, localDeps(port, { timeoutMs: 250 })),
    );
    expect(error.siteFetchCode).toBe('timeout');
  });
});

describe('safeFetchHtml: response size limits and encodings', () => {
  it('truncates an oversized body at the cap instead of buffering it all', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, htmlHeaders);
      const chunk = 'a'.repeat(64 * 1024);
      for (let i = 0; i < 80; i += 1) res.write(chunk); // ~5 MiB offered
      res.end();
    });
    const result = await safeFetchHtml(
      `http://site.test:${port}/`,
      localDeps(port, { maxBodyBytes: 100_000 }),
    );
    expect(result.truncated).toBe(true);
    expect(result.html.length).toBeLessThanOrEqual(100_000);
    expect(result.html.length).toBeGreaterThan(0);
  });

  it('still parses head content when the page is truncated', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, htmlHeaders);
      res.write('<html><head><title>Big page</title></head><body>');
      res.write('x'.repeat(500_000));
      res.end();
    });
    const result = await safeFetchHtml(
      `http://site.test:${port}/`,
      localDeps(port, { maxBodyBytes: 10_000 }),
    );
    expect(result.truncated).toBe(true);
    expect(result.html).toContain('<title>Big page</title>');
  });

  it('decodes gzip responses', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, { ...htmlHeaders, 'Content-Encoding': 'gzip' });
      res.end(zlib.gzipSync(HTML));
    });
    const result = await safeFetchHtml(`http://site.test:${port}/`, localDeps(port));
    expect(result.html).toBe(HTML);
  });

  it('caps a decompression bomb by DECODED size', async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(40 * 1024 * 1024)); // 40 MiB of zeros, tiny on the wire
    expect(bomb.length).toBeLessThan(200_000);
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, { ...htmlHeaders, 'Content-Encoding': 'gzip' });
      res.end(bomb);
    });
    const result = await safeFetchHtml(
      `http://site.test:${port}/`,
      localDeps(port, { maxBodyBytes: 50_000 }),
    );
    expect(result.truncated).toBe(true);
    expect(result.html.length).toBeLessThanOrEqual(50_000);
  });

  it('reports a corrupt compressed body as bad_response', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, { ...htmlHeaders, 'Content-Encoding': 'gzip' });
      res.end('this is not gzip data at all');
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('bad_response');
  });

  it('reports an unsupported content-encoding as bad_response', async () => {
    const { port } = await startServer((_req, res) => {
      res.writeHead(200, { ...htmlHeaders, 'Content-Encoding': 'zstd' });
      res.end('whatever');
    });
    const error = await rejection(safeFetchHtml(`http://site.test:${port}/`, localDeps(port)));
    expect(error.siteFetchCode).toBe('bad_response');
  });
});
