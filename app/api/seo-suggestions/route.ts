import {
  classifyAiError,
  describeAiError,
  findSiteFetchError,
  toClientError,
} from '@/lib/ai/errors';
import {
  createSeoSuggestions,
  InvalidSeoSuggestionOutputError,
  parseSeoSuggestionRequest,
  SeoSuggestionConfigurationError,
} from '@/lib/ai/seo-suggestions';
import { getClientKey, rateLimit } from '@/lib/security/rate-limit';

export const maxDuration = 30;

const MAX_REQUEST_BYTES = 4096;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

async function readLimitedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(getClientKey(request));
  if (!limit.ok) {
    return Response.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfterSeconds) },
      },
    );
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: 'Request body is too large.' }, 413);
  }

  let rawBody: string | null;
  try {
    rawBody = await readLimitedBody(request);
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }
  if (rawBody === null) {
    return jsonResponse({ error: 'Request body is too large.' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const input = parseSeoSuggestionRequest(body);
  if (!input) {
    return jsonResponse(
      { error: 'Provide a valid HTTP or HTTPS URL without embedded credentials.' },
      400,
    );
  }

  try {
    return jsonResponse(await createSeoSuggestions(input.url), 200);
  } catch (error) {
    const siteError = findSiteFetchError(error);
    if (siteError) {
      console.warn('[seo-suggestions] site fetch failed', {
        code: siteError.code,
        host: safeHost(input.url),
      });
      return jsonResponse({ error: siteError.message }, 502);
    }

    if (error instanceof SeoSuggestionConfigurationError) {
      console.error(`[seo-suggestions] AI configuration error: ${error.detail}`);
      return jsonResponse(
        { error: toClientError('config_missing') },
        503,
      );
    }

    if (error instanceof InvalidSeoSuggestionOutputError) {
      console.error('[seo-suggestions] AI provider returned invalid suggestion data');
      return jsonResponse(
        { error: 'Suggestions could not be validated. Please try again.' },
        502,
      );
    }

    console.error('[seo-suggestions] AI request failed:', {
      code: classifyAiError(error),
      ...describeAiError(error),
    });
    return jsonResponse(
      { error: toClientError(classifyAiError(error)) },
      502,
    );
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid-url';
  }
}
