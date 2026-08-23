import { describe, expect, it } from 'vitest';
import { rateLimit } from '../rate-limit';

describe('rateLimit', () => {
  it('allows requests under the limit', () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(rateLimit(key).ok).toBe(true);
    }
  });

  it('blocks the request once the window limit is exceeded', () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 20; i++) rateLimit(key);
    const result = rateLimit(key);
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks separate keys independently', () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    for (let i = 0; i < 20; i++) rateLimit(keyA);
    // keyA is now exhausted; keyB should be unaffected.
    expect(rateLimit(keyB).ok).toBe(true);
  });
});
