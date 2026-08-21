import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChat } from '@ai-sdk/react';
import { AuditChat } from '../AuditChat';

// The real network boundary in this component is `useChat` (from
// @ai-sdk/react), which internally drives fetch/streaming against
// /api/audit-chat. Mocking it here means these tests never touch the
// real route, let alone the real Anthropic API — the mock IS the route
// as far as this component can tell.
vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(),
}));

function mockUseChat(overrides: Partial<ReturnType<typeof useChat>>) {
  (useChat as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    messages: [],
    sendMessage: vi.fn(),
    addToolResult: vi.fn(),
    status: 'ready',
    error: undefined,
    regenerate: vi.fn(),
    ...overrides,
  });
}

describe('AuditChat', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state with no messages yet', () => {
    mockUseChat({ messages: [], status: 'ready' });
    render(<AuditChat />);
    expect(
      screen.getByText(/paste a page in, get a prioritized seo audit back/i)
    ).toBeInTheDocument();
  });

  it('pending: shows the audit skeleton after the user sends, before a reply arrives', () => {
    mockUseChat({
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'https://example.com' }] }],
      status: 'submitted',
    });
    render(<AuditChat />);
    expect(screen.getByText(/fetching meta tags/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/paste a page in, get a prioritized seo audit back/i)
    ).not.toBeInTheDocument();
  });

  it('streaming: renders an in-progress tool call inline', () => {
    mockUseChat({
      messages: [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'https://example.com' }] },
        {
          id: '2',
          role: 'assistant',
          parts: [
            {
              type: 'tool-fetchMetaTags',
              toolCallId: 'call_1',
              state: 'input-available',
              input: { url: 'https://example.com' },
            },
          ],
        },
      ],
      status: 'streaming',
    });
    render(<AuditChat />);
    expect(screen.getAllByText('https://example.com').length).toBeGreaterThan(0);
  });

  it('error: shows the banner and wires the retry button to regenerate()', async () => {
    const regenerate = vi.fn();
    mockUseChat({
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'https://example.com' }] }],
      status: 'error',
      error: new Error('fetch failed'),
      regenerate,
    });
    const user = userEvent.setup();
    render(<AuditChat />);

    expect(screen.getByText(/lost the connection/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry last message/i }));
    expect(regenerate).toHaveBeenCalledTimes(1);
  });
});
