# Checkpoint 1 — failure & edge-case testing

## Inventory

| Case | Where it's handled |
|---|---|
| Network failure before send | `useChat`'s `error` -> `ChatErrorBanner`, "Retry last message" |
| API error mid-stream | `onChunk` sabotage hook throws mid-text -> same banner, classified as a generic provider failure (`ai_error:provider_failed`) |
| Provider config/quota/auth errors | `lib/ai/errors.ts` classifies them server-side; the client only receives an `ai_error:<code>` token, mapped to banner copy |
| Target-site failures (404/429/503, timeout, non-HTML, blocked or private destination, DNS, oversized body) | `lib/security/safe-fetch.ts` raises a typed `SiteFetchError`; the route forwards its own safe message as the tool card's error text, never an `ai_error:` provider code |
| Rate limit (429) | Route returns 429 before calling the model -> banner classifies as rate-limited, distinct copy |
| Malformed tool output | `MetaTagsFindingsCard` guards `findings`/`score` shape -> amber notice, no crash |
| Empty input | Form `submit()` no-ops on blank/whitespace — nothing sent, no error |
| No results (page has no meta tags) | `MetaTagsFindingsCard`'s `nothingFound` branch — explained as a real result, not an error |
| First-run empty state | `EmptyState` — three click-to-fill example URLs, not a dead end |
| Slow / pending response | `AuditSkeleton`, shown only in the gap between `submitted` and the first streamed part |

## Sabotage script (run in this order)

Route accepts `?sabotage=<mode>` in development only (`NODE_ENV !== 'production'`
guard in `route.ts`) — no separate build needed to trigger each mode.

1. **Kill network before send** — DevTools → Network → Offline, then send a
   message. Expect: `error` populates immediately, banner reads "lost the
   connection", retry button re-sends the same message once back online.
2. **Kill mid-stream** — `POST /api/audit-chat?sabotage=mid-stream`. Expect:
   partial text/tool output already rendered stays on screen, banner appears
   below it (doesn't replace what already streamed in), retry re-sends only
   that turn.
3. **429** — `POST /api/audit-chat?sabotage=429`. Expect: banner shows the
   rate-limit copy, not the generic one.
4. **Malformed tool JSON** — `POST /api/audit-chat?sabotage=malformed`.
   Expect: tool part still reaches `output-available` (it didn't throw), but
   the card shows the amber "wasn't in the expected shape" notice instead of
   crashing the message list.
5. **Empty conversation, first run** — clear local state / open in a new
   session. Expect: `EmptyState`, not a blank panel.

## Known gaps

No live preview URL or recording is attached here — this environment can't
host a persistent Next.js server or capture a screen recording. The steps
above are written so they're reproducible the moment this is deployed
(Vercel or similar): each sabotage mode is a URL param, no code edits
required to demo it.

Still to verify on a real device before submitting: iOS Safari keyboard
behavior (the `scrollIntoView` timing in `AuditChat`'s `onFocus` is tuned
against a simulator, not hardware) and actual CLS while a response streams
in (`AuditSkeleton` is sized to match `MetaTagsFindingsCard` by eye, not
measured in DevTools).
