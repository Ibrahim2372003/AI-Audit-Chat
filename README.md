# Audit Chat — streaming SEO audit (FE2 capstone, core AI interaction)

A streaming chat interface where a user pastes a URL and/or page content
(title tag, meta description, headings, body copy) and gets back a
structured, prioritized SEO audit — streamed token by token, stoppable
mid-generation, usable at phone width.

## Key files

- **Route handler:** [`app/api/chat/route.js`](app/api/chat/route.js) — calls
  Claude via the AI SDK's `streamText` and returns a UI message stream.
- **Chat component:** [`components/chat/AuditChat.jsx`](components/chat/AuditChat.jsx)
  — the client-side orchestrator, built on `useChat`.
- **Model config:** [`lib/ai/config.js`](lib/ai/config.js) — system prompt
  and generation settings, in one commented file.

## How it's built

- **Server** — `app/api/chat/route.js` receives the message history,
  converts it with `convertToModelMessages`, calls `streamText` with the
  Anthropic provider, and returns the result via
  `createUIMessageStreamResponse` / `toUIMessageStream`. The Anthropic call
  is wired to the incoming request's `abortSignal`, so stopping generation
  client-side actually cancels the upstream call, not just the UI.
- **Client** — `useChat` from `@ai-sdk/react` drives all chat state
  (`messages`, `status`, `stop`, `sendMessage`, `error`, `regenerate`).
  `AuditChat.jsx` composes four small pieces:
  - `MessageBubble.jsx` — renders one message; assistant text goes through
    [Streamdown](https://streamdown.ai) (a streaming-aware Markdown
    renderer) so half-finished Markdown — an unclosed `**bold`, a dangling
    code fence — doesn't visually break mid-stream the way it would with a
    naive Markdown parser.
  - `ThinkingIndicator.jsx` — shown before the first token, in the same DOM
    slot the streamed text will occupy, crossfaded rather than swapped, so
    there's no one-frame flicker at the handoff.
  - `ChatComposer.jsx` — the input: auto-growing textarea, Enter to send /
    Shift+Enter for a newline, 16px font (stops iOS auto-zoom), 44px tap
    targets, `env(safe-area-inset-bottom)` padding for notches.
  - `hooks/useStickToBottom.js` — pins the message list to the bottom only
    while the user is already there; the moment they scroll up (including
    mid-stream) the pin releases and a "Jump to latest" button appears.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your real ANTHROPIC_API_KEY
npm run dev                   # http://localhost:3000
```

The key lives in `.env.local` (git-ignored) and is only ever read
server-side in `app/api/chat/route.js` — it has no `NEXT_PUBLIC_` prefix, so
it's never bundled into client code.

## Deploying (manual steps — do this part yourself)

This was built in a sandboxed environment with no network or git access, so
none of this has actually been run or deployed yet:

1. `git init && git add -A && git commit -m "FE2: streaming audit chat"`
2. Push to a new GitHub repo.
3. In Vercel: **Add New → Project**, import the repo (Next.js auto-detected).
4. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**
   (Production + Preview) — paste your real key, never commit it.
5. Deploy, then actually hold a conversation on the preview URL: send a
   message, watch it stream, hit Stop mid-stream, confirm the input
   re-enables and the next message still sends, resize to phone width.

## Mapping to the evaluation criteria

| Criterion | Where it's handled |
|---|---|
| Responses stream token by token | `streamText` → `toUIMessageStream`, consumed by `useChat` |
| Stoppable mid-stream without breaking state | `stop()` from `useChat` + `abortSignal: req.signal` server-side; partial message persists because `messages` state isn't rolled back, `status` returns to `"ready"` so the composer re-enables |
| Survives multiple turns | `useChat` keeps the full message history and resends it (via `convertToModelMessages`) on every turn |
| API key server-side only | Read from `process.env.ANTHROPIC_API_KEY` inside the route handler only; never exposed to the client |
| Usable at phone width | `h-dvh` layout, sticky composer with safe-area padding, 44px controls, 16px input font, tested breakpoint-free (fluid, not just a `sm:` swap) |

## Known scope boundaries

- **No web-fetch tool.** This task is specifically about the streaming
  interaction, not the crawling/audit engine — the system prompt is
  explicit that the model only sees what's pasted into the chat. Wiring an
  actual URL-fetch tool is natural follow-up work (flagged in the brief as
  FE-07, which extends this same route handler).
- **No persistence.** Refreshing loses the conversation — the brief lists
  this as an optional stretch goal, not core scope here.
- **No motion pass beyond the thinking→text crossfade and standard
  Tailwind transitions** — the brief's full "Motion with Intent"
  choreography pass is flagged as a stretch goal.
