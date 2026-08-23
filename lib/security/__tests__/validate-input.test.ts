import { describe, expect, it } from 'vitest';
import { validateMessages } from '../validate-input';

describe('validateMessages', () => {
  it('accepts a normal, small conversation', () => {
    const messages = [{ role: 'user', parts: [{ type: 'text', text: 'https://example.com' }] }];
    const result = validateMessages(messages);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-array payload', () => {
    const result = validateMessages({ not: 'an array' });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty conversation', () => {
    const result = validateMessages([]);
    expect(result.ok).toBe(false);
  });

  it('rejects a conversation over the message-count cap', () => {
    const messages = Array.from({ length: 41 }, () => ({
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    }));
    const result = validateMessages(messages);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too long/i);
  });

  it('rejects a single message with an oversized text part', () => {
    const messages = [{ role: 'user', parts: [{ type: 'text', text: 'x'.repeat(5000) }] }];
    const result = validateMessages(messages);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/too long/i);
  });
});
