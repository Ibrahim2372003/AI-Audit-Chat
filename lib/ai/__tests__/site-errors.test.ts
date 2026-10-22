import { describe, expect, it } from 'vitest';
import { SiteFetchError, SITE_FETCH_MESSAGES } from '../../security/site-fetch-error';
import { classifyAiError, findSiteFetchError, toClientErrorText } from '../errors';

describe('findSiteFetchError', () => {
  it('recognises a SiteFetchError directly and when wrapped as a cause', () => {
    const inner = new SiteFetchError('timeout', "The site didn't respond within 8 seconds.", 'deadline');
    expect(findSiteFetchError(inner)).toEqual({
      code: 'timeout',
      message: "The site didn't respond within 8 seconds.",
      detail: 'deadline',
    });
    const wrapped = Object.assign(new Error('Tool execution failed'), { cause: inner });
    expect(findSiteFetchError(wrapped)?.code).toBe('timeout');
  });

  it('ignores provider errors, plain errors and non-errors', () => {
    expect(findSiteFetchError({ statusCode: 429, message: 'quota' })).toBeNull();
    expect(findSiteFetchError(new Error('boom'))).toBeNull();
    expect(findSiteFetchError('text')).toBeNull();
    expect(findSiteFetchError(null)).toBeNull();
    expect(findSiteFetchError(undefined)).toBeNull();
  });
});

describe('toClientErrorText: website failures are not AI-provider failures', () => {
  it('REGRESSION: a target site answering 429/503 is not reported as a provider rate limit/outage', () => {
    const site429 = new SiteFetchError('http_error', 'Fetch failed: 429 Too Many Requests');
    const site503 = new SiteFetchError('http_error', 'Fetch failed: 503 Service Unavailable');
    expect(toClientErrorText(site429)).toBe('Fetch failed: 429 Too Many Requests');
    expect(toClientErrorText(site503)).toBe('Fetch failed: 503 Service Unavailable');
    expect(toClientErrorText(site429)).not.toContain('ai_error:');
    expect(toClientErrorText(site503)).not.toContain('ai_error:');
  });

  it('still classifies genuine provider errors with a fixed token', () => {
    expect(toClientErrorText({ statusCode: 429, message: 'You exceeded your current quota' })).toBe(
      'ai_error:quota_or_rate_limit',
    );
    expect(toClientErrorText({ statusCode: 503, message: 'The model is overloaded' })).toBe(
      'ai_error:provider_unavailable',
    );
    expect(toClientErrorText(new Error('Simulated mid-stream interruption'))).toBe(
      'ai_error:provider_failed',
    );
  });

  it('shows why the split is needed: the provider classifier alone WOULD mislabel a site 429', () => {
    const site429 = new SiteFetchError('http_error', 'Fetch failed: 429 Too Many Requests');
    expect(classifyAiError(site429)).toBe('quota_or_rate_limit');
    expect(toClientErrorText(site429)).not.toBe('ai_error:quota_or_rate_limit');
  });

  it('never carries raw network details or addresses in the fixed messages', () => {
    for (const message of Object.values(SITE_FETCH_MESSAGES)) {
      expect(message).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
      expect(message).not.toMatch(/ECONN|ENOTFOUND|getaddrinfo|stack/i);
    }
  });
});
