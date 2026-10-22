import { describe, expect, it } from 'vitest';
import {
  AI_ERROR_COPY,
  classifyAiError,
  describeAiError,
  parseAiErrorCode,
  redactSecrets,
  toClientError,
} from '../errors';

describe('classifyAiError', () => {
  it.each([
    [{ statusCode: 429, message: 'You exceeded your current quota' }, 'quota_or_rate_limit'],
    [{ statusCode: 400, message: 'API key not valid. Please pass a valid API key.' }, 'auth_invalid'],
    [{ statusCode: 403, message: 'PERMISSION_DENIED' }, 'auth_invalid'],
    [{ statusCode: 400, message: 'Your credit balance is too low to access the Anthropic API.' }, 'credits_exhausted'],
    [
      {
        statusCode: 400,
        responseBody:
          '{"error":{"status":"FAILED_PRECONDITION","message":"Gemini API free tier is not available in your country."}}',
      },
      'region_unsupported',
    ],
    [{ statusCode: 404, message: 'model not found' }, 'model_unavailable'],
    [{ statusCode: 503, message: 'The model is overloaded' }, 'provider_unavailable'],
    [new Error('Simulated mid-stream interruption'), 'provider_failed'],
    [new Error('Google Generative AI API key is missing.'), 'config_missing'],
  ])('classifies %j as %s', (error, expected) => {
    expect(classifyAiError(error)).toBe(expected);
  });

  it('follows the cause chain for the status code', () => {
    const wrapped = Object.assign(new Error('wrapped'), { cause: { statusCode: 429 } });
    expect(classifyAiError(wrapped)).toBe('quota_or_rate_limit');
  });
});

describe('client error token', () => {
  it('round-trips a code through the wire format', () => {
    expect(parseAiErrorCode(toClientError('config_missing'))).toBe('config_missing');
  });

  it('finds the code inside a JSON error body', () => {
    expect(parseAiErrorCode('{"error":"ai_error:quota_or_rate_limit"}')).toBe('quota_or_rate_limit');
  });

  it('ignores unknown codes and ordinary messages', () => {
    expect(parseAiErrorCode('ai_error:bogus')).toBeNull();
    expect(parseAiErrorCode('Request failed with status 429')).toBeNull();
    expect(parseAiErrorCode(undefined)).toBeNull();
  });

  it('has user-facing copy for every code, recognisable to the e2e spec', () => {
    for (const copy of Object.values(AI_ERROR_COPY)) {
      expect(copy).toMatch(/failed to send|api credits|rate limit/i);
    }
  });
});

describe('redaction and safe logging', () => {
  it('scrubs credential-shaped substrings', () => {
    expect(redactSecrets('k AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345 x')).not.toContain('AIza');
    expect(redactSecrets('sk-ant-api03-FAKEFAKEFAKE')).not.toContain('sk-ant');
    expect(redactSecrets('Authorization: Bearer abcdef123456789')).toContain('Bearer [redacted]');
    expect(redactSecrets('https://x/y?key=abc123&z=1')).toBe('https://x/y?key=[redacted]&z=1');
  });

  it('describeAiError truncates long messages and never includes a request body', () => {
    const error = Object.assign(new Error('x'.repeat(1000)), {
      statusCode: 400,
      requestBodyValues: { secretPrompt: 'do-not-log' },
    });
    const described = describeAiError(error);
    expect(described.message.length).toBeLessThanOrEqual(301);
    expect(JSON.stringify(described)).not.toContain('do-not-log');
    expect(described.status).toBe(400);
  });
});
