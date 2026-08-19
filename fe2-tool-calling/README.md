# FE2 — Tool calling & generative UI

Adds server-side tool calling to the audit chat, with each stage of the tool
lifecycle rendered as its own component instead of a JSON dump.

## Files

```
lib/tools/fetch-meta-tags.ts        server tool: fetch + parse + score a URL
lib/tools/confirm-rescan.ts         user-interaction tool (no execute)
app/api/audit-chat/route.ts         streamText route + dev-only sabotage modes
app/error.tsx                       route-segment error boundary
app/audit-chat/error.tsx            same, scoped to the chat route
components/tool-parts/
  MetaTagsToolPart.tsx              the 4-state renderer
  MetaTagsFindingsCard.tsx          the result, rendered as a table + score
  ConfirmRescanPart.tsx             confirm/skip UI for the interaction tool
components/chat/
  AuditChat.tsx                     useChat wiring, error/retry, mobile fixes
  AuditSkeleton.tsx                 pending-state skeleton, sized to match the card
  EmptyState.tsx                    first-run empty state with example prompts
  ChatErrorBanner.tsx               error copy + guarded retry button
TESTING.md                          Checkpoint 1 sabotage checklist
```

See `TESTING.md` for the failure-mode inventory and the sabotage script
(network kill, mid-stream kill, 429, malformed tool output, empty state).

## Tool contract

### `fetchMetaTags`

Fetches a URL server-side and extracts SEO meta tags.

| | |
|---|---|
| **Input** | `{ url: string }` — must be a valid absolute URL |
| **Output** | `{ url, fetchedAt, tags, score, findings }` |
| **`tags`** | `{ title, description, canonical, robots, ogTitle, ogImage, twitterCard }` — each `string \| null` |
| **`score`** | `number`, 0–100, weighted sum of the checklist below |
| **`findings`** | `{ label: string, pass: boolean, value: string \| null }[]` |
| **Errors thrown** | non-2xx response, non-HTML content-type, or fetch timeout (8s) — all surface as `output-error` with `part.errorText` |

Scoring checklist: title present (20), description present (20), canonical
present (15), OG title present (15), OG image present (15), Twitter card
present (15); a non-passing bonus check flags titles outside 10–60 chars.

### `confirmRescan`

No `execute` — this is a client tool. The model calls it only when it wants
to re-fetch a URL already audited this session. The stream pauses at
`input-available`; `ConfirmRescanPart` renders a confirm/skip prompt; the
client resolves it via `addToolResult()`, which resumes the model with the
user's choice.

| | |
|---|---|
| **Input** | `{ url: string, reason: string }` |
| **Output** (client-supplied) | `{ confirmed: boolean }` |

## Tool-part states

`part.state` on a `tool-fetchMetaTags` part moves through:

1. **`input-streaming`** — args are still being generated; shows a pulsing
   dot and the URL typing in as it streams (falls back to a skeleton line
   before any text arrives).
2. **`input-available`** — args are final, `execute` is running; shows a
   spinner next to the exact URL being fetched.
3. **`output-available`** — renders `MetaTagsFindingsCard`: URL, score
   badge (green/amber/red by threshold), and a pass/fail table — not JSON.
4. **`output-error`** — thrown errors land here with `part.errorText`; shows
   a red panel with the message plus a plain-language hint, designed
   up front rather than left as a fallback.

Each state has a distinct dot color, icon, and layout so a user can tell
what's happening without reading text. The shell fades/slides in on state
change (`Shell`'s `fadeIn` keyframe) instead of hard-swapping.

## Setup

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/react zod
```

Drop `lib/`, `app/api/audit-chat/`, and `components/` into the existing
Next.js app (paths assume the `@/*` alias already used in the audit-chat
repo), set `ANTHROPIC_API_KEY`, and render `<AuditChat />` on a page.

## Known gap

No live preview URL is included here — these files are meant to be dropped
into the existing Audit-Chat Next.js project and deployed from there (e.g.
`vercel deploy`), since this environment can't host a persistent Next.js
server itself.
