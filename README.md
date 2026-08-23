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
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

### Tests

```bash
npm test            # Vitest + React Testing Library — 31 tests, 8 files
npx tsc --noEmit     # TypeScript, strict-enough project config
npm run build        # production build (Next.js/Turbopack)
npm run test:e2e     # Playwright — see "Known gaps" below
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Calls Claude via `@ai-sdk/anthropic`. Without it, `/api/audit-chat` returns an auth error (the UI shows this as a designed error banner, not a crash). |
| `NODE_ENV` | No — set automatically | Next.js sets this itself (`development`/`production`). The route checks it to disable the `?sabotage=` manual-QA switch outside development. |

No other environment variables are read anywhere in the codebase — this
table is exhaustive, not abbreviated.

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
  ai/tools/                    fetchMetaTags, confirmRescan tool definitions
  security/                    rate-limit.ts, validate-input.ts (this round)
tests, .github/workflows/test.yml
```

**Stack**: Next.js (App Router) + the Vercel AI SDK (`ai`, `@ai-sdk/react`,
`@ai-sdk/anthropic`) for streaming tool-calling chat, Tailwind for
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

- **No live production URL yet.** Deploying this needs a Vercel account
  (or equivalent) connected to the repo, `ANTHROPIC_API_KEY` set as a
  production environment variable, and a deploy triggered — none of which
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
   `ANTHROPIC_API_KEY` for the Production environment (and Preview, if you
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
