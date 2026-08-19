import { streamText, convertToModelMessages, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { fetchMetaTags } from '@/lib/ai/tools/fetch-meta-tags';
import { confirmRescan } from '@/lib/ai/tools/confirm-rescan';

// Same schema, deliberately broken output — for testing that the UI
// doesn't crash when a tool "succeeds" but hands back an unusable shape.
const fetchMetaTagsMalformed = tool({
  description: fetchMetaTags.description,
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => ({ url, tags: null, findings: undefined }) as any,
});

export const maxDuration = 30;

/**
 * Sabotage switch for manual QA — NOT a real feature, strip before shipping
 * (or gate behind `process.env.NODE_ENV !== 'production'`, done below).
 * Drive it with ?sabotage=<mode> on the client request. Modes match the
 * mentor-suggested test order:
 *   429        -> simulate a rate limit before the model is even called
 *   mid-stream -> let text start, then throw partway through
 *   malformed  -> tool "succeeds" but returns a shape the UI can't use
 */
function sabotageMode(req: Request): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  return new URL(req.url).searchParams.get('sabotage');
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const sabotage = sabotageMode(req);

  if (sabotage === '429') {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system:
      'You are the FlyRank audit assistant. When the user gives a URL, call fetchMetaTags ' +
      'on it before commenting. The UI already renders the raw findings as a table, so your ' +
      'reply should add plain-language interpretation, not repeat the data. If a URL was ' +
      'already audited earlier in this conversation and the user asks to check it again, ' +
      'call confirmRescan first instead of fetching directly.',
    messages : await convertToModelMessages(messages),
    tools: {
      fetchMetaTags: sabotage === 'malformed' ? fetchMetaTagsMalformed : fetchMetaTags,
      confirmRescan,
    },
    onChunk:
      sabotage === 'mid-stream'
        ? ({ chunk }) => {
            // Let a couple of chunks through so the happy-path UI is visible
            // first, then blow up — this is what a dropped connection or an
            // Anthropic-side interruption mid-stream looks like downstream.
            if (chunk.type === 'text-delta' && Math.random() < 0.3) {
              throw new Error('Simulated mid-stream interruption');
            }
          }
        : undefined,
    onError: ({ error }) => {
      console.error(
        '[audit-chat] stream error:',
        error instanceof Error ? error.message : String(error),
      );
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      // Message forwarded to the client's useChat `error` object — keep it
      // short and free of stack traces, the UI decides how to phrase it.
      error instanceof Error ? error.message : 'Something went wrong.',
  });
}
