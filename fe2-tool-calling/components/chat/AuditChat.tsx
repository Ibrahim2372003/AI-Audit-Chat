'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MetaTagsToolPart } from '../tool-parts/MetaTagsToolPart';
import { ConfirmRescanPart } from '../tool-parts/ConfirmRescanPart';
import { AuditSkeleton } from './AuditSkeleton';
import { EmptyState } from './EmptyState';
import { ChatErrorBanner } from './ChatErrorBanner';

export function AuditChat() {
  const { messages, sendMessage, addToolResult, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/audit-chat',
    }),
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content, but don't fight iOS rubber-band scrolling —
  // scrollIntoView with 'nearest' is a no-op if the anchor's already visible.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages]);

  const submit = (text: string) => {
    if (!text.trim()) return;
    sendMessage({ text });
  };

  const isEmpty = messages.length === 0;
  // Show the skeleton only for the gap between "sent" and the first part
  // arriving — once any part exists, MetaTagsToolPart's own input-streaming
  // /input-available states take over, so this never runs alongside them.
  const showSkeleton = status === 'submitted' && messages.at(-1)?.role === 'user';

  return (
    // 100dvh (not 100vh) so iOS Safari's address-bar collapse doesn't leave
    // a scroll gap under the pinned input; overscroll-behavior-y: contain
    // stops rubber-band scroll on the page from also dragging this panel.
    <div className="flex h-[100dvh] flex-col bg-[#0B0E14] [overscroll-behavior-y:contain]">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {isEmpty && !showSkeleton && <EmptyState onPick={submit} />}

        {messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((part: any, i: number) => {
              if (part.type === 'text') {
                return (
                  <p key={i} className="text-sm leading-relaxed text-[#E7E9EE]">
                    {part.text}
                  </p>
                );
              }
              if (part.type === 'tool-fetchMetaTags') {
                return <MetaTagsToolPart key={i} part={part} />;
              }
              if (part.type === 'tool-confirmRescan') {
                return (
                  <ConfirmRescanPart
                    key={i}
                    part={part}
                    onRespond={(confirmed) =>
                      addToolResult({
                        toolCallId: part.toolCallId,
                        tool: 'confirmRescan',
                        output: { confirmed },
                      })
                    }
                  />
                );
              }
              return null;
            })}
          </div>
        ))}

        {showSkeleton && <AuditSkeleton />}

        {error && <ChatErrorBanner error={error} onRetry={() => regenerate()} />}

        <div ref={scrollAnchorRef} />
      </div>

      {/* Sticky input, padded for the home-indicator safe area, and pushed
          above the iOS keyboard by scrollIntoView on focus rather than
          relying on the viewport resize (which Safari handles late/never
          for position:sticky children). */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = inputRef.current;
          if (input) {
            submit(input.value);
            input.value = '';
          }
        }}
        className="sticky bottom-0 flex gap-2 border-t border-[#262B36] bg-[#0B0E14] px-4 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          ref={inputRef}
          name="prompt"
          placeholder="Paste a URL to audit…"
          enterKeyHint="send"
          onFocus={(e) =>
            setTimeout(
              () => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' }),
              300
            )
          }
          style={{ fontSize: '16px' }}
          className="min-w-0 flex-1 rounded-md border border-[#262B36] bg-[#12151C] px-3 py-2 font-mono text-[#E7E9EE] outline-none focus:border-[#7C9CFF]"
        />
        <button
          type="submit"
          disabled={status === 'streaming' || status === 'submitted'}
          className="shrink-0 rounded-md bg-[#7C9CFF] px-4 py-2 text-sm font-semibold text-[#12151C] disabled:opacity-50"
        >
          {status === 'streaming' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

// Kept alongside the named export so either `import { AuditChat }` or
// `import AuditChat` resolves — pick one style project-wide, though, so a
// future rename doesn't silently break whichever import you didn't use.
export default AuditChat;
