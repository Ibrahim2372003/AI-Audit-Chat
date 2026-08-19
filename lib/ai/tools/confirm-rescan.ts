import { tool } from 'ai';
import { z } from 'zod';

/**
 * confirmRescan
 * -------------
 * Deliberately has NO `execute`. That's what makes it a client/user-interaction
 * tool instead of a server tool: the stream pauses at `input-available`, the UI
 * renders a confirm/skip prompt, and the client resolves it by calling
 * `addToolResult()`, which resumes the model with the user's decision.
 *
 * Used when the model wants to re-fetch a URL already audited this session
 * (avoids silently re-hitting a third-party site without asking).
 */
export const confirmRescan = tool({
  description:
    'Ask the user to confirm before re-scanning a URL that was already fetched ' +
    'earlier in this conversation. Only call this for a URL you have already audited.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL that would be re-scanned'),
    reason: z
      .string()
      .describe('One short, plain-language sentence explaining why a re-scan is being suggested'),
  }),
});
