# Audit Chat — AI-powered SEO audit assistant

A streaming AI chat that audits a webpage's SEO fundamentals — paste in a
title tag, meta description, headings, and body copy (or a full HTML
blob), and it calls a tool to score and structure the findings, then
explains them in plain language. Built as a FlyRank internship capstone
(FE2 track).

**Production URL:** _not yet deployed — see "Deploying this" below for
exactly what's left._

## Screenshots

Not included. The environment this project was iterated in has no
installable browser (confirmed repeatedly across this project's build —
`apt-get install chromium-browser` pulls in `snapd`, which 404s against
that sandbox's package mirror), so no real screenshot could be captured
honestly. Once deployed, replace this section with 2–3 real screenshots:
the empty state (shader hero + headline), a completed audit (findings
table), and the error/retry state.

## What it actually does

1. You describe a page (or paste real HTML/meta content) in the chat.
2. The model calls a `fetchMetaTags`-style tool that extracts and scores
   SEO signals — title, meta description, canonical, Open Graph, Twitter
   card, robots — against a small fixed checklist (0–100 score).
3. Results render as a real component (a score badge + pass/fail table),
   not a JSON dump.
4. The model adds plain-language interpretation on top, not a repeat of
   the raw data.
5. If you ask about a URL already audited this conversation, a
   `confirmRescan` tool asks for explicit confirmation before re-running
   it — a deliberate user-interaction tool (no server `execute`; the
   client resolves it).

## Run it locally

```bash
git clone <your-repo-url>
cd audit-chat
npm install
cp .env.example .env.local   # then fill in GOOGLE_GENERATIVE_AI_API_KEY and GEMINI_MODEL
npm run dev                  # http://localhost:3000
```

### AI provider setup (Gemini, no paid credits required for development)

The default provider is Google Gemini, called server-side through
`@ai-sdk/google` (see `lib/ai/model.ts`). The key never reaches the browser.

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In `.env.local`, set `GOOGLE_GENERATIVE_AI_API_KEY` to that key.
3. Set `GEMINI_MODEL` to a model ID **shown in your own AI Studio model
   list** that has free-tier quota on your account. `.env.example` ships
   `gemini-3.5-flash-lite` as a starting point taken from Google's public
   pricing page; that is not a guarantee it is available to you.
4. Restart `npm run dev` (Next.js only reads `.env.local` at startup).

**Free-tier quotas and model availability change, and they vary by account
and country.** Check your actual access and limits in AI Studio rather than
relying on this README. Google's free tier is subject to per-minute and
per-day limits, and free-tier content may be used to improve Google's
products, so don't send sensitive pages while testing on it.

To use Anthropic instead (requires prepaid API credits), set
`AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`.

If the key or model is missing, quota is exhausted, or the provider rejects
the request, the chat shows a designed error banner. The server logs a
redacted one-line summary (provider, model, error class, HTTP status) and
never logs keys, headers, or request bodies.

### Tests

```bash
npm test            # Vitest + React Testing Library
npx tsc --noEmit     # TypeScript, strict-enough project config
npm run build        # production build (Next.js/Turbopack)
npm run test:e2e     # Playwright — see "Known gaps" below
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | No | `google` (default) or `anthropic`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes, for `google` | Gemini API key from Google AI Studio. Server-side only. |
| `GEMINI_MODEL` | Yes, for `google` | Gemini model ID. No built-in default on purpose: use one confirmed in your AI Studio account. |
| `ANTHROPIC_API_KEY` | Yes, for `anthropic` | Calls Claude via `@ai-sdk/anthropic`. Requires prepaid credits. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-4-6`. |
| `NODE_ENV` | No — set automatically | Next.js sets this itself (`development`/`production`). The route checks it to disable the `?sabotage=` manual-QA switch outside development. |

With a missing key or model, `/api/audit-chat` returns a 503 and the UI
shows a designed error banner, not a crash. `.env.example` lists these
variables with placeholders only.

## Architecture overview

```
app/
  page.jsx                    the live entry point — chat UI, inlined
  api/audit-chat/route.ts     POST handler: rate limit → validate → stream
  error.tsx, audit-chat/error.tsx   route-level error boundaries
components/
  chat/AuditChat.tsx           a parallel copy of page.jsx's UI (see note)
  chat/EmptyState.jsx          empty-state content, wraps the shader hero
  chat/tool-parts/             typed renderers for each tool-call state
  hero/ShaderHero.tsx          raw WebGL fragment shader hero
  ChatErrorBanner.tsx, AuditSkeleton.tsx, forms/UrlInputForm.tsx
lib/
  ai/model.ts                  provider/model selection (server-side env)
  ai/errors.ts                 provider-error classification + safe client codes
  ai/tools/                    fetchMetaTags, confirmRescan tool definitions
  security/                    rate-limit.ts, validate-input.ts, ssrf.ts (destination policy),
                               safe-fetch.ts (guarded fetch), site-fetch-error.ts (typed errors)
tests, .github/workflows/test.yml
```

**Stack**: Next.js (App Router) + the Vercel AI SDK (`ai`, `@ai-sdk/react`,
`@ai-sdk/google`, `@ai-sdk/anthropic`) for streaming tool-calling chat, Tailwind for
styling, Vitest + React Testing Library + axe-core for tests, Playwright
for the one e2e spec, raw WebGL (no Three.js) for the hero.

**Note on the duplicate file**: `app/page.jsx` and
`components/chat/AuditChat.tsx` are near-identical implementations of the
same chat UI. `page.jsx` is what actually renders at `/`; `AuditChat.tsx`
is what the test suite imports and is otherwise dead code today. This was
flagged, not resolved, across several rounds of this project — worth
picking one and deleting the other before a real production push.

## Decisions worth explaining

- **Raw WebGL for the shader hero, not Three.js/R3F.** The hero is one
  fullscreen fragment shader with three uniforms — Three.js's scene
  graph, camera, and renderer abstractions would add real bundle weight
  for something this doesn't need. Zero new dependencies for it.
- **In-memory rate limiting, not a Redis-backed service.** Deliberately
  the minimal, dependency-free option: works within a warm serverless
  instance (stops a casual abuse loop from one IP), but doesn't
  coordinate across cold starts or multiple instances. Documented as a
  real limitation in `lib/security/rate-limit.ts`, not oversold — the
  standard upgrade path (`@upstash/ratelimit`) is a deliberate non-goal
  for a capstone at this scale.
- **Accessibility fixes driven by real math, not guesswork.** Contrast
  ratios were computed with the actual WCAG relative-luminance formula
  before any color was chosen (see the project's `AUDIT.md` for the full
  before/after) — including catching a real bug where one component used
  an entirely different, mismatched light-theme color palette left over
  from an earlier draft, rendering a heading at a 1.07 contrast ratio
  (effectively invisible) until it was found and fixed.

## How AI tools built this — specifics, not platitudes

This project was built through an extended, iterative session with
Claude (Anthropic), with the human reviewing, redirecting, and
explicitly correcting course multiple times. Specific, verifiable
instances, not a generic "AI helped write code" claim:

- **The AI caught and fixed real bugs it introduced itself**, and said so
  plainly rather than hiding it: a synthetic-event bug (`e.currentTarget`
  read inside a `setTimeout`, which React can null out before the
  callback fires — a real, subtle React gotcha, not a typo); a scrim-math
  edit that silently deleted a `mouseX` assignment during a DPR-cap
  change, caught only by re-reading the file rather than trusting the
  diff; a broken third-party test package (`vitest-axe`'s own
  `extend-expect` entry ships as a literal empty file) diagnosed and
  replaced with a ~10-line hand-written matcher instead of being patched
  around.
- **The AI refused to fabricate results it couldn't produce.** Repeatedly
  declined to invent Lighthouse scores, WAVE results, or screenshots when
  no browser was available in its working environment — instead
  documented the constraint plainly, gave exact commands to run for real,
  and incorporated the human's actual pasted results (real Lighthouse
  numbers, real WAVE contrast-error counts) once provided, rather than
  guessing at what they'd say in advance.
- **The human corrected scope creep and drift explicitly**, multiple
  times — redirecting the AI away from a scratch/sandbox copy of the
  project back to the real one, insisting on inspection-before-changes,
  and rejecting a first attempt to state Lighthouse was "unavailable"
  after a real result had already been provided.
- **Every claim of "passing" in this README is backed by a command that
  was actually run** in the process of building it (`npm test`,
  `npx tsc --noEmit`, `npm run build`), not asserted from confidence.
  Where something couldn't be verified — a live URL, a real device's
  frame rate, WAVE's specific flagged elements beyond the totals given —
  this document says so instead of implying otherwise.

## Production hygiene (this round)

- **Rate limiting**: `lib/security/rate-limit.ts` — 20 requests/hour per
  client IP (`x-forwarded-for`), in-memory, checked before the request
  body is even parsed.
- **Input caps**: `lib/security/validate-input.ts` — max 40 messages per
  conversation, max 4,000 characters per message part. Both return a 400
  before the model is ever called.
- **`maxDuration = 30`** on the streaming route — comfortably under
  Vercel Hobby's 60s ceiling, generous enough for a real audit turn.
- Both are genuinely wired into `app/api/audit-chat/route.ts` and covered
  by real tests (`lib/security/__tests__/`), not just described here.

## Known gaps — stated plainly, not smoothed over

- **SSRF protection for `fetchMetaTags` is implemented but not a guarantee,
  and the app should not be called production-safe.** Fetches go through
  `lib/security/safe-fetch.ts`: http/https only, ports 80/443 only, no
  credentials in URLs, private/loopback/link-local/CGNAT/multicast/reserved
  IPv4 and IPv6 ranges blocked (including IPv4-mapped/NAT64/6to4 forms),
  and the destination address is validated **at connect time** (so a DNS
  answer that changes between check and connection cannot bypass it).
  Redirects are followed manually (max 5) and each hop is re-validated.
  There is an 8 s total deadline, a 2 MiB decoded-body cap (bodies are
  truncated, not rejected, because the tags we parse are near the top), and
  the existing 2xx and `text/html` checks. Website failures use a typed
  `SiteFetchError` and are kept separate from AI-provider errors. Limits
  that remain: no outbound allow-list or egress proxy, so protection relies
  on this application-level check; only the standard ports are allowed (so
  sites on other ports can't be audited); IP-range lists are maintained by
  hand and need review as standards change; the in-memory rate limit is
  per-instance only (see above) and the endpoint has no authentication;
  the guard has been exercised by local-socket tests, not against a real
  hostile DNS server. Treat it as defence in depth, and review before
  exposing a deployment to untrusted users.
- **Gemini integration:** reported working in the developer's local manual
  tests (several sites and an invalid URL). It has not been verified in a
  deployed environment.

- **No live production URL yet.** Deploying this needs a Vercel account
  (or equivalent) connected to the repo, the provider variables above
  (`GOOGLE_GENERATIVE_AI_API_KEY` and `GEMINI_MODEL`) set as production
  environment variables, and a deploy triggered — none of which
  is possible from the sandboxed environment this was built in (no
  internet access beyond a fixed package-registry allowlist, no way to
  authenticate to Vercel). See "Deploying this" below for the exact steps.
- **Playwright's one e2e spec is written but never executed** — the same
  sandbox has no installable Chromium (`npx playwright install chromium`
  fails with a 403 against a CDN not on the allowlist, confirmed by
  trying). Type-checks cleanly; genuinely unrun.
- **WAVE and a real keyboard-only pass**: WAVE was run once by the human
  (0 errors, 6 contrast errors, 1 small-text alert) and every flagged
  element was traced to a real cause and fixed — but no confirmation
  re-run has happened yet. The manual keyboard walkthrough described in
  `AUDIT.md` has not been performed.
- **Real device frame-rate for the shader hero** was never measured —
  only the code-level mitigations (capped DPR, pause-on-hidden,
  reduced-motion fallback) are verified, not an actual FPS number from a
  phone.
- **The duplicate `AuditChat.tsx`/`page.jsx` file** (see Architecture
  above) should be resolved before this is genuinely production-clean —
  right now a fix applied to one and not the other is a real drift risk,
  mitigated so far only by manually diffing them after each change.

## Deploying this — exact steps

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. [Import the repo into Vercel](https://vercel.com/docs/deployments) —
   framework preset auto-detects as Next.js, no config needed.
3. In Vercel's project settings → Environment Variables, add
   `GOOGLE_GENERATIVE_AI_API_KEY` and `GEMINI_MODEL` (or the Anthropic
   equivalents) for the Production environment (and Preview, if you
   want preview deployments to work too).
4. Deploy. Vercel builds with `npm run build` automatically.
5. Cross-browser pass: open the deployed URL in actual Chrome, Firefox,
   Safari, and mobile Safari — this hasn't been done from this
   environment (no browser available) and is a real remaining step, not
   a formality.
6. Optional: attach a custom domain under Project Settings → Domains.

## Git history

Not cleaned as part of this round — this environment has no access to
the project's actual git repository (only a working copy of the files was
available), so this couldn't be done here. If the history has
work-in-progress commits worth squashing, `git rebase -i` against
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
style messages (`feat:`, `fix:`, `test:`, `docs:`) is the standard
approach — do this before the final push, since rewriting history after
Vercel has already deployed from a branch can desync the two.
