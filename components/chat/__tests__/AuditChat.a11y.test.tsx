import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { useChat } from '@ai-sdk/react';
import { AuditChat } from '../AuditChat';

/**
 * Real axe-core rule engine, run against the actual production component
 * via jsdom — no browser required. This is NOT a substitute for a real
 * WAVE/Lighthouse pass: jsdom has no layout or paint engine, so
 * color-contrast, focus-visibility-in-practice, and anything depending on
 * actual rendering are NOT reliably checked here (axe marks those
 * "incomplete" rather than pass/fail). What this DOES catch for real:
 * missing landmarks, invalid ARIA, missing labels, heading order, and
 * duplicate IDs — the structural half of the audit.
 */
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
    stop: vi.fn(),
    ...overrides,
  });
}

describe('AuditChat — axe-core structural accessibility (jsdom)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('empty state has no axe violations', async () => {
    mockUseChat({ messages: [], status: 'ready' });
    const { container } = render(<AuditChat />);
    expect(await axe.run(container)).toHaveNoViolations();
  });

  it('streaming state (tool call + busy input) has no axe violations', async () => {
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
    const { container } = render(<AuditChat />);
    expect(await axe.run(container)).toHaveNoViolations();
  });

  it('error state (with retry button) has no axe violations', async () => {
    mockUseChat({
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'https://example.com' }] }],
      status: 'error',
      error: new Error('fetch failed'),
    });
    const { container } = render(<AuditChat />);
    expect(await axe.run(container)).toHaveNoViolations();
  });
});
