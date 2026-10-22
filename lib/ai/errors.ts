/**
 * Provider-agnostic classification of AI provider failures.
 *
 * Two audiences share this file, so it is plain TypeScript with no server-only
 * imports:
 *  - the route handler (server) classifies a thrown provider error, logs a
 *    redacted summary, and forwards ONLY a short `ai_error:<code>` token to
 *    the browser, never the provider's raw message;
 *  - ChatErrorBanner (client) turns that token back into user-facing copy.
 *
 * Classification uses duck typing (statusCode / responseBody / message / cause)
 * rather than `instanceof APICallError`, so it keeps working across AI SDK
 * minor versions and for both the Google and Anthropic providers.
 *
 * Status/text mappings for Google come from the Gemini API error reference:
 * 400 INVALID_ARGUMENT (also returned for a bad API key), 400 FAILED_PRECONDITION
 * (free tier unavailable in the country), 403 PERMISSION_DENIED, 404 NOT_FOUND,
 * 429 RESOURCE_EXHAUSTED (RPM, TPM, RPD, or spend: Google does not distinguish
 * them by status, so neither do we), 5xx/503 transient.
 */

export const AI_ERROR_PREFIX = 'ai_error:';

export type AiErrorCode =
  | 'config_missing'
  | 'auth_invalid'
  | 'credits_exhausted'
  | 'quota_or_rate_limit'
  | 'region_unsupported'
  | 'model_unavailable'
  | 'provider_unavailable'
  | 'provider_failed';

const AI_ERROR_CODES: readonly string[] = [
  'config_missing',
  'auth_invalid',
  'credits_exhausted',
  'quota_or_rate_limit',
  'region_unsupported',
  'model_unavailable',
  'provider_unavailable',
  'provider_failed',
];

/**
 * User-facing copy. Every string deliberately contains one of the phrases the
 * e2e spec accepts for a handled failure ("failed to send", "api credits",
 * "rate limit"), so a designed error banner is always recognisable as one.
 */
export const AI_ERROR_COPY: Record<AiErrorCode, string> = {
  config_missing:
    "The audit service isn't configured: the AI provider key or model is missing on the server. Your message failed to send.",
  auth_invalid:
    "The AI provider rejected the server's API key or its permissions, so that message failed to send.",
  credits_exhausted:
    'The audit service has no API credits available. Check billing for the AI provider, then retry.',
  quota_or_rate_limit:
    "The AI provider's rate limit or free-tier quota was reached. Wait a minute and retry; if it keeps happening, the daily quota may be used up.",
  region_unsupported:
    "The AI provider reports its free tier isn't available from where this server runs, so that message failed to send.",
  model_unavailable:
    "The configured AI model wasn't found or isn't available to this key, so that message failed to send. Check the server's model setting.",
  provider_unavailable:
    'The AI provider is temporarily unavailable or overloaded, so that message failed to send. Retry in a moment.',
  provider_failed:
    'The AI provider returned an error, so that message failed to send. Try again in a moment.',
};

/** What the server sends to the browser. Safe by construction: a fixed token. */
export function toClientError(code: AiErrorCode): string {
  return `${AI_ERROR_PREFIX}${code}`;
}

/**
 * Recover the code from a client-side Error message. Works whether the message
 * is the bare token (stream error part) or a JSON body containing it
 * (non-streaming 4xx/5xx response). Returns null for anything else.
 */
export function parseAiErrorCode(message: string | null | undefined): AiErrorCode | null {
  if (!message) return null;
  const match = message.match(/ai_error:([a-z_]+)/);
  if (!match) return null;
  return AI_ERROR_CODES.includes(match[1]) ? (match[1] as AiErrorCode) : null;
}

// ---- server-side classification -------------------------------------------

type ErrorLike = {
  statusCode?: unknown;
  status?: unknown;
  message?: unknown;
  responseBody?: unknown;
  name?: unknown;
  cause?: unknown;
};

const MAX_CHAIN_DEPTH = 4;
const MAX_TEXT_CHARS = 4000;

function chainOf(error: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = error;
  for (let i = 0; i < MAX_CHAIN_DEPTH && current && typeof current === 'object'; i += 1) {
    chain.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return chain;
}

export function extractStatus(error: unknown): number | undefined {
  for (const item of chainOf(error)) {
    for (const candidate of [item.statusCode, item.status]) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Lower-cased text used for classification only. Never logged or sent out. */
function classificationText(error: unknown): string {
  const parts: string[] = [];
  if (typeof error === 'string') parts.push(error);
  for (const item of chainOf(error)) {
    if (typeof item.message === 'string') parts.push(item.message.slice(0, MAX_TEXT_CHARS));
    if (typeof item.responseBody === 'string') parts.push(item.responseBody.slice(0, MAX_TEXT_CHARS));
  }
  return parts.join('\n').toLowerCase();
}

export function classifyAiError(error: unknown): AiErrorCode {
  const status = extractStatus(error);
  const text = classificationText(error);

  // Anthropic reports an empty prepaid balance as a 400, so match on text first.
  if (/credit balance|insufficient[_ ]quota|purchase credits/.test(text)) {
    return 'credits_exhausted';
  }

  // The SDK throws this when the env var is missing at request time. The route
  // pre-checks configuration, so this is a backstop.
  if (/api key is missing|loadapikeyerror/.test(text)) return 'config_missing';

  // Google returns 400 INVALID_ARGUMENT ("API key not valid") for a bad key.
  if (
    status === 401 ||
    status === 403 ||
    /api key not valid|api_key_invalid|reported as leaked|invalid x-api-key|authentication_error|permission_denied/.test(
      text,
    )
  ) {
    return 'auth_invalid';
  }

  if (status === 400 && /failed_precondition|not available in your country/.test(text)) {
    return 'region_unsupported';
  }

  if (status === 429 || /resource_exhausted|rate limit|too many requests|quota/.test(text)) {
    return 'quota_or_rate_limit';
  }

  if (status === 404 || /not_found_error|model_not_found/.test(text)) {
    return 'model_unavailable';
  }

  if ((status !== undefined && status >= 500) || /overloaded|unavailable/.test(text)) {
    return 'provider_unavailable';
  }

  return 'provider_failed';
}

// ---- safe logging ------------------------------------------------------------

/**
 * Best-effort scrub of credential-shaped substrings. Defence in depth: the log
 * line below only ever includes the error's `message`, never request bodies,
 * headers, or the raw error object, but a provider message could still echo a
 * key fragment or a URL with `?key=`.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1[redacted]');
}

const MAX_LOG_MESSAGE_CHARS = 300;

export function describeAiError(error: unknown): {
  name: string;
  status: number | undefined;
  message: string;
} {
  const first = (chainOf(error)[0] ?? {}) as ErrorLike;
  const name = typeof first.name === 'string' ? first.name : typeof error;
  const rawMessage =
    typeof first.message === 'string' ? first.message : typeof error === 'string' ? error : '';
  const redacted = redactSecrets(rawMessage);
  const message =
    redacted.length > MAX_LOG_MESSAGE_CHARS ? `${redacted.slice(0, MAX_LOG_MESSAGE_CHARS)}…` : redacted;
  return { name, status: extractStatus(error), message };
}
