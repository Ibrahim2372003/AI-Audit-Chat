/**
 * Caps on the request payload itself. Rate limiting stops *how often*
 * someone can call the route; this stops *how expensive* a single call
 * can be — a request under the rate limit but with 500 messages or a
 * 100,000-character message would still be a real cost problem without
 * this.
 *
 * Numbers are deliberately generous for real conversations (a genuine
 * audit thread rarely exceeds a handful of turns) while still ruling out
 * anything resembling a scripted abuse payload.
 */
const MAX_MESSAGES = 40;
const MAX_TEXT_LENGTH_PER_PART = 4000;

export function validateMessages(messages: unknown): { ok: boolean; reason: string } {
  if (!Array.isArray(messages)) {
    return { ok: false, reason: 'messages must be an array' };
  }
  if (messages.length === 0) {
    return { ok: false, reason: 'messages cannot be empty' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, reason: `conversation too long (max ${MAX_MESSAGES} messages)` };
  }

  for (const message of messages) {
    const parts = (message as { parts?: unknown[] })?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const text = (part as { text?: unknown })?.text;
      if (typeof text === 'string' && text.length > MAX_TEXT_LENGTH_PER_PART) {
        return {
          ok: false,
          reason: `a message is too long (max ${MAX_TEXT_LENGTH_PER_PART} characters per message)`,
        };
      }
    }
  }

  return { ok: true, reason: '' };
}
