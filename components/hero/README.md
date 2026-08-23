# Shader hero — "audit aurora"

Live above the empty-state headline in the actual capstone
(`components/chat/EmptyState.jsx` → `components/hero/ShaderHero.tsx`) —
not a standalone demo page. This is the real, deployed hero.

## What it is

A domain-warped flow field (the classic fbm-of-fbm "aurora" technique)
rendered in raw WebGL1 — no Three.js, no React Three Fiber, zero new npm
dependencies. Palette is the app's own real dark-theme colors
(`#0B0E14`/`#7C9CFF`/`#4FD1A5`/`#E8B44D`), not a separate marketing look.

## Uniforms used (all three)

- **`u_time`** — drives the flow field forward; also gates the
  reduced-motion fallback (see below)
- **`u_resolution`** — aspect-correct, centered coordinate space
  (`(gl_FragCoord.xy - 0.5*u_resolution) / u_resolution.y`) so the pattern
  isn't stretched on non-square canvases
- **`u_mouse`** — the interaction beyond orbiting: the sample point leans
  gently toward the cursor (`clamp(mouseP - p, -0.6, 0.6) * 0.15`), so the
  whole flow subtly follows wherever the pointer's been, without ever
  snapping or distorting sharply around it

## What I can walk through, line by line

`components/hero/hero.frag.glsl` is the documented source (same content
inlined into `ShaderHero.tsx` to avoid needing a custom Next.js GLSL
loader — see the comment at the top of that file). Nine numbered sections:
hash/noise/fbm (cheap pseudo-random → organic flow), the app's real
palette as vec3 constants, aspect-correct coordinates, the mouse lean, the
three-layer domain warp itself, the palette mix, a vignette, the headline
scrim, and a grain pass. Every section has a comment explaining *why*,
not just what.

## The contrast guarantee — not a hope, a computed bound

Before writing the scrim math, I computed the worst case: the brightest
color the shader ever mixes toward (`#4FD1A5`), scaled by the scrim's
strongest darkening factor, checked against the headline's actual text
color (`#E7E9EE`) with the real WCAG relative-luminance formula. At
`k=0.35` (the value shipped), that's **8.13:1** — well past the 4.5:1
requirement, with real margin for whatever the flow field is doing
underneath. The scrim itself is a soft `smoothstep` band centered on where
the headline actually sits (`uv.y ≈ 0.5`), not a global multiply, so
readability is guaranteed specifically where the text is, not just on
average.

## Ships responsibly

- **Capped `devicePixelRatio`** at 1.5 in `resize()` — same reasoning as
  the earlier 3D-viewer task: a high-density phone screen multiplying
  every fragment invocation isn't worth the imperceptible gain past 1.5x.
- **Pauses when the tab is hidden** — an explicit `visibilitychange`
  listener cancels the `requestAnimationFrame` loop entirely (not relying
  on the browser's looser ~1fps background-tab throttling), and tracks
  elapsed time across the pause so the flow resumes smoothly instead of
  jumping back to `t=0`.
- **`prefers-reduced-motion: reduce`** → one static frame at `t=0`, no
  animation loop started at all. Deliberately the *same* shader and
  palette frozen, rather than a second hardcoded gradient to keep in sync
  by hand.
- **Fallback for missing WebGL entirely**: a CSS radial-gradient in the
  same palette sits behind the canvas at all times — visible instantly on
  first paint before WebGL initializes, and stays as the real fallback if
  `getContext('webgl')` returns null.
- **Fullscreen-triangle technique** (3 vertices, not a 6-vertex quad) —
  cheaper and avoids the diagonal seam a two-triangle quad can introduce.

## A real bug this caught

Building this against the actual test suite (not just eyeballing the
code) surfaced two genuine jsdom gaps — `window.matchMedia` and (already
known from an earlier task) `scrollIntoView` aren't implemented in jsdom
at all. Fixed both: a defensive `window.matchMedia ? ... : false` guard in
the component itself (real robustness — some embedded webviews lack it
too, not just jsdom), plus a jsdom stub in `vitest.setup.ts` for the test
environment specifically. Full suite: **23/23 passing** after the fix.
`npx tsc --noEmit` and `npm run build` both clean.

## Known gap

**No live URL, same honest caveat as every prior round in this project**:
this sandbox has no browser to actually render WebGL in (confirmed
unavailable in earlier tasks — no installable Chromium). The GLSL was
written carefully and the JS/TS side is verified for real (type-checks,
passes the full test suite including the axe-core accessibility pass on
the page that now contains it, builds clean) — but nobody has watched the
aurora actually flow yet. If a shader compile error exists that only a
real GPU driver would catch, `console.error('[ShaderHero] shader compile
error:', ...)` is wired up to surface it immediately in the browser
console.
