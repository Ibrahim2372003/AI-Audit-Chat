'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

import { AuditSkeleton } from '../components/AuditSkeleton';
import { ChatErrorBanner } from '../components/ChatErrorBanner';
import EmptyState from '../components/chat/EmptyState';
import { MetaTagsToolPart } from '../components/chat/tool-parts/MetaTagsToolPart';
import { ConfirmRescanPart } from '../components/chat/tool-parts/ConfirmRescanPart';

export function AuditChat() {
  const { messages, sendMessage, addToolResult, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/audit-chat',
    }),
  });

  const inputRef = useRef(null);
  const scrollAnchorRef = useRef(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages]);

  const submit = (text) => {
    if (!text.trim()) return;
    sendMessage({ text });
  };

  const isEmpty = messages.length === 0;
  const showSkeleton = status === 'submitted' && messages.at(-1)?.role === 'user';

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0B0E14] [overscroll-behavior-y:contain]">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {isEmpty && !showSkeleton && <EmptyState />}

        {messages.map((message) => (
          <div key={message.id}>
            {message.parts.map((part, i) => {
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
          onFocus={() =>
            setTimeout(
              () => inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
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

// Default export added so `import AuditChat from '@/components/chat/AuditChat'`
// (as used in app/page.jsx) resolves correctly, alongside the named export
// for anywhere else it might be imported as `{ AuditChat }`.
export default AuditChat;
