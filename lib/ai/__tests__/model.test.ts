import { describe, expect, it } from 'vitest';
import { resolveModel } from '../model';

describe('resolveModel', () => {
  it('defaults to google and reports a missing key by name only', () => {
    const result = resolveModel({});
    expect(result).toEqual({
      status: 'misconfigured',
      detail: 'GOOGLE_GENERATIVE_AI_API_KEY is not set',
    });
  });

  it('treats a whitespace-only key as missing', () => {
    const result = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: '   ', GEMINI_MODEL: 'm' });
    expect(result.status).toBe('misconfigured');
  });

  it('requires GEMINI_MODEL rather than assuming a default', () => {
    const result = resolveModel({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' });
    expect(result).toEqual({ status: 'misconfigured', detail: 'GEMINI_MODEL is not set' });
  });

  it('resolves google with the configured model id', () => {
    const result = resolveModel({
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
      GEMINI_MODEL: 'example-model-id',
    });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('example-model-id');
    }
  });

  it('keeps anthropic selectable, with the previous model as its default', () => {
    expect(resolveModel({ AI_PROVIDER: 'anthropic' })).toEqual({
      status: 'misconfigured',
      detail: 'ANTHROPIC_API_KEY is not set',
    });
    const result = resolveModel({ AI_PROVIDER: 'Anthropic', ANTHROPIC_API_KEY: 'test-key' });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.provider).toBe('anthropic');
      expect(result.modelId).toBe('claude-sonnet-4-6');
    }
  });

  it('rejects an unknown provider without echoing the value', () => {
    const result = resolveModel({ AI_PROVIDER: 'secret-looking-value' });
    expect(result.status).toBe('misconfigured');
    if (result.status === 'misconfigured') expect(result.detail).not.toContain('secret-looking-value');
  });
});
