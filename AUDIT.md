# AUDIT.md — Accessibility audit

## Scope

This sandbox still has no Chromium binary and no deployed preview URL of
its own (confirmed last round: `apt-get install chromium-browser` pulls in
`snapd`, whose `.deb` 404s against this environment's package mirror) —
so Lighthouse and WAVE could not be run *from here*. That constraint no
longer blocks the Lighthouse result, though: **a real Lighthouse mobile
audit has now been run locally, in Chrome DevTools, against the actual
app**, and its results are recorded in section 5 below exactly as
reported, with no invented numbers.

**WAVE and the manual keyboard-only pass have not been performed yet.**
Both are marked pending below — this document does not claim the task is
complete.

Everything else in this document — the code fixes, the contrast math, the
axe-core run, the production build — was executed for real in this
environment, against the actual project files, not simulated.

---

## 1. Accessibility fixes made

| File | Change | Requirement addressed |
|---|---|---|
| `components/chat/AuditChat.tsx`, `app/page.jsx` | Root `<div>` → `<main>` | Landmark region |
| same | Added visually-hidden `<h1>SEO audit chat</h1>` | Heading hierarchy (page previously started at `<h2>` in `EmptyState`, with no `<h1>`) |
| same | `aria-live="polite"` on assistant text parts | Streamed output announced to assistive tech |
| same | Loading/streaming state now shows a real `<button type="button" onClick={() => stop()}>Stop</button>` instead of a `disabled` Send button | Keyboard-reachable way to cancel an in-flight request — there was none before |
| same | Input and both buttons: `focus-visible:outline` rings added | Input previously only changed border *color* on focus (fails a non-color-only focus indicator); Send button had no focus style at all |
| `app/error.tsx`, `app/audit-chat/error.tsx` | `<h2>` → `<h1>` | These boundaries replace the entire page tree when they fire — their heading is the only one on screen at that moment, so it needs to be `<h1>`, not an orphaned `<h2>` |
| `components/ChatErrorBanner.tsx` | Added `role="alert"` to the banner container | Error state was otherwise silent to screen readers unless the user happened to be focused near it |

No visual or layout change beyond the Stop/Send button swap, which replaces
a previously non-functional disabled button with a working one in the same
slot.

## 2. Drift check — `AuditChat.tsx` vs. the live `app/page.jsx` copy

The project has two near-duplicate copies of the chat UI (`app/page.jsx`,
which Next actually renders at `/`, and `components/chat/AuditChat.tsx`,
which is otherwise unused dead code but is what the test suite imports).
Diffed both files programmatically after stripping import paths,
TypeScript-only annotations, and the one `export default` line that only
`AuditChat.tsx` needs — **structurally identical**. Every fix in section 1
was applied to both, verified by this diff rather than by assumption.

## 3. Color contrast — real math, not a Lighthouse screenshot

Computed with the actual WCAG relative-luminance formula against every
foreground/background pair used in the app:

| Pair | Ratio | AA normal (4.5) | AA large (3.0) |
|---|---|---|---|
| Primary text on page bg | 15.90 | PASS | PASS |
| Muted status label on panel | 5.76 | PASS | PASS |
| Button text on primary button | 7.01 | PASS | PASS |
| Error text on error tint bg | 5.87 | PASS | PASS |
| Score-high (green) text | 9.56 | PASS | PASS |
| Score-mid (amber) text | 9.63 | PASS | PASS |
| Table value text (muted) | 5.76 | PASS | PASS |
| Table label text | 11.00 | PASS | PASS |
| Input text | 15.04 | PASS | PASS |
| Error banner text on page bg | 6.21 | PASS | PASS |

All ten pass AA. This is exact color math, not rendered-pixel measurement —
it doesn't account for browser color management or anti-aliasing. A real
WAVE/axe browser pass is still worth running.

## 4. Structural accessibility — real axe-core run (jsdom, no browser)

`components/chat/__tests__/AuditChat.a11y.test.tsx` runs the real
`axe-core` engine (industry-standard, comparable to but not identical to
WAVE) against the actual `AuditChat` component via jsdom, across
empty/streaming/error states.

**Real limitation, stated plainly:** jsdom has no layout or paint engine.
axe's color-contrast checks come back "incomplete" here rather than
pass/fail — that's why section 3 exists as a separate, genuinely reliable
check. What this run **does** reliably verify: landmarks, ARIA validity,
form labels, heading order, duplicate IDs.

Before this task's fixes (reconstructed by reverting the component and
re-running the same test file):
```
✗ landmark-one-main: Document should have one main landmark
✗ page-has-heading-one: Page must contain a level-one heading
```

After:
```
✓ empty state has no axe violations
✓ streaming state (tool call + busy input) has no axe violations
✓ error state (with retry button) has no axe violations
```

## 5. Lighthouse — real result

**After Lighthouse audit: Performance 91, Accessibility 95.**

Run locally in Chrome DevTools, Lighthouse's **Mobile** preset, against the
actual app. This is a real, user-provided result — not generated or
estimated by me.

| Metric | Result |
|---|---|
| Performance | **91** |
| Accessibility | **95** |
| First Contentful Paint | 0.8s |
| Largest Contentful Paint | 1.5s |
| Total Blocking Time | 380ms |
| Cumulative Layout Shift | 0 |
| Speed Index | 0.8s |

Both scores clear the rubric's 90 target (and comfortably clear the 80
absolute minimum). No "before" score is reported here — no baseline
Lighthouse run was captured prior to this task's fixes, so a before/after
delta for Lighthouse specifically cannot be shown. Section 4 above has a
real before/after for the structural axe-core checks instead.

**Lighthouse scores vary between runs** — CPU throttling simulation,
network conditions, and machine load all shift results by a few points
run to run. Treat 91/95 as representative of this build, not as an exact,
permanently fixed number.

**One number worth a second look, not a code change:** Total Blocking
Time of 380ms sits in Lighthouse's "needs improvement" band (under 200ms
is "good," over 600ms is "poor"). I'm not changing any code against this
on a single top-line number — the Lighthouse report's own diagnostics
panel (which specific script/task is blocking the main thread) would be
needed to make a targeted fix rather than a guess, and I don't have that
detail. Worth flagging: was this run against `next dev` (which ships
unminified, unoptimized JS and typically inflates TBT) or a production
build / deployed instance? If it was the dev server, a re-run against
`npm run build && npm run start` would likely show a materially different
TBT — worth checking before treating 380ms as a real production number.

## 6. Still pending — WAVE and the manual keyboard pass

Not performed. Exact steps to do both:

**WAVE:**
```
1. Install the WAVE browser extension (https://wave.webaim.org/extension/)
2. Open your deployed URL, run WAVE on / (empty state) and mid-conversation
3. Note the Errors and Alerts counts specifically
```

**Keyboard-only pass (manual, no tool needed):**
```
1. Tab from page load — confirm focus visibly lands on the input first
2. Type a URL, press Enter — while it's streaming, Tab to "Stop" and
   press Enter/Space — confirm it actually cancels the request
3. Trigger an error (or use ?sabotage=429 from the earlier task) —
   confirm Tab reaches "Retry last message" and Enter/Space activates it
4. Confirm nothing in this flow requires a mouse
```

Paste the results of either back and I'll act on what they actually show.

## 7. Test suite, type-check, and build — run for real, this session

```
Test Files  6 passed (6)
     Tests  23 passed (23)
```
(19 pre-existing + 3 axe-core structural tests + 1 new test verifying the
Stop button is reachable by Tab and calls `stop()` on Enter — not just
clickable, actually keyboard-operable, confirmed via `userEvent.tab()`.)

`npx tsc --noEmit` — clean, 0 errors (with the standard auto-generated
`next-env.d.ts` present; it's gitignored and regenerates on `next dev`).

`npm run build` — clean production build, Next 16.3.1/Turbopack, real
compile + type-check + static generation:
```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/audit-chat
└ ○ /motion-demo
```

## 8. `.gitignore`

**This project had no `.gitignore` at all before this task** — confirmed
by checking both this working copy and the originally uploaded source.
Right now, `git add .` would stage `node_modules`, the `.next` build
output, a real `tsconfig.tsbuildinfo` (generated by this session's own
`tsc` runs, since `tsconfig.json` has `"incremental": true`), and
`.env.local` if one exists locally. Added a standard `.gitignore` covering
`node_modules`, `.next`/`out`/`build`, `*.tsbuildinfo`, `next-env.d.ts`,
`.env`/`.env*.local` (not `.env.example`, which stays trackable),
`coverage`/`test-results`/`playwright-report` (relevant once the earlier
testing task's Playwright suite runs), and standard OS/log noise.

## 9. Flagged, not fixed

Things noticed during this pass that don't rise to "fix it" under "make
minimal changes, don't touch working functionality":

- `ConfirmRescanPart`'s two buttons don't declare `type="button"`
  explicitly. Currently harmless — they're not nested inside the `<form>`
  in the DOM (confirmed structurally) — but worth adding defensively if
  the layout ever changes.
- The app still has two near-duplicate chat UI files (`app/page.jsx` live,
  `components/chat/AuditChat.tsx` dead code) — flagged in an earlier
  round, not this task's job to resolve, but still true.

## 10. Scorecard against this task's criteria

| Criterion | Status |
|---|---|
| Lighthouse mobile 90+ | **Met.** Performance 91, Accessibility 95 — real result, Chrome DevTools, Mobile preset (section 5). Scores vary run to run; treat as representative, not exact. |
| Zero WAVE errors | **Not measured yet.** axe-core (a comparable but not identical engine) is clean on everything it can check without a browser (section 4); WAVE itself still needs to be run (section 6). |
| Primary flow completable by keyboard | Built for — real buttons throughout, visible focus rings, Tab-order verified in an automated test for the Stop button specifically — but **not yet walked in a real browser** (section 6). |
| Measurable before/after deltas | Contrast ratios and axe-core violations-before/none-after are real, verified deltas (sections 3–4). Lighthouse has an "after" only — no baseline was captured before this task's fixes, so no Lighthouse delta is claimed. |

**This task is not fully complete.** Lighthouse is done and passes the
rubric's bar. WAVE and the manual keyboard-only pass are still
outstanding — this document will keep saying so until they're actually
performed and their real results are recorded here.
