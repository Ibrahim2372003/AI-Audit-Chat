/**
 * Errors raised while fetching the website the user asked us to audit.
 *
 * These are deliberately a separate family from AI-provider errors
 * (lib/ai/errors.ts): "the target site returned 429/503" must never be
 * reported as "the AI provider is rate limited / unavailable".
 *
 * `message` is written to be shown to the end user and to the model: it never
 * contains resolved IP addresses, ports, stack traces, or raw network error
 * text. Anything diagnostic goes in `detail`, which is for server logs only.
 *
 * The class is branded with a plain `siteFetchCode` property, and consumers
 * detect it by duck typing (see findSiteFetchError in lib/ai/errors.ts), so
 * detection survives bundling that duplicates this module, or an SDK that
 * wraps the thrown error as the `cause` of another.
 */

export type SiteFetchErrorCode =
  | 'invalid_url'
  | 'blocked_destination'
  | 'dns_failed'
  | 'timeout'
  | 'network_error'
  | 'too_many_redirects'
  | 'http_error'
  | 'not_html'
  | 'bad_response';

export class SiteFetchError extends Error {
  readonly siteFetchCode: SiteFetchErrorCode;
  /** Server-log only. Never forwarded to the client. */
  readonly detail: string | undefined;

  constructor(code: SiteFetchErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'SiteFetchError';
    this.siteFetchCode = code;
    this.detail = detail;
  }
}

/** Fixed, user-safe copy for the codes whose text does not depend on input. */
export const SITE_FETCH_MESSAGES = {
  invalid_url: "That doesn't look like a valid public http(s) URL.",
  blocked_destination:
    "That address can't be audited: private, internal, and non-standard-port destinations are blocked.",
  dns_failed: "Couldn't resolve that hostname. Check the domain name for typos.",
  network_error:
    "Couldn't connect to the site (connection refused, reset, or a TLS/certificate problem).",
  too_many_redirects: 'The site redirected too many times.',
  bad_response: "The site sent a response that couldn't be read.",
} as const;

/** Strip control characters and cap length for values echoed into messages. */
export function sanitizeForMessage(value: string, maxLength = 80): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

export function timeoutMessage(timeoutMs: number): string {
  const spoken =
    timeoutMs < 1000 ? `${timeoutMs} ms` : `${Math.round(timeoutMs / 1000)} seconds`;
  return `The site didn't respond within ${spoken}.`;
}
