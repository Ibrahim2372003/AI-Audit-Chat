import { useState } from 'react';

type Status = 'idle' | 'submitted' | 'streaming' | 'ready' | 'error';
type Message = { id: string; role: 'user' | 'assistant'; parts: any[] };

/**
 * Test-project stand-in for the real project's `useChat` from `@ai-sdk/react`.
 * Same shape (messages/status/error/retry), but talks to `fetch` directly
 * instead of the SDK's streaming transport, so these tests can mock the AI
 * route with a plain `vi.spyOn(global, 'fetch')` — no need to install or
 * mock the AI SDK package itself just to prove the boundary is mockable.
 *
 * In the real project, swap this hook back for `useChat` and mock
 * `@ai-sdk/react` the same way (`vi.mock('@ai-sdk/react', ...)`) instead.
 */
export function useSimpleChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<Error | undefined>();

  const sendMessage = async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text }],
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setStatus('submitted');
    setError(undefined);

    try {
      const res = await fetch('/api/audit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, data.message]);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setStatus('error');
    }
  };

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((m) => m.filter((msg) => msg.id !== lastUser.id));
    void sendMessage(lastUser.parts[0].text);
  };

  return { messages, status, error, sendMessage, retry };
}
