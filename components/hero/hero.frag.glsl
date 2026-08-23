// hero.frag.glsl
//
// This is the exact fragment shader that ships inside ShaderHero.tsx
// (inlined there as a template literal — Next's default webpack config
// has no loader for raw .glsl imports, so this file is documentation/
// reference, not something the build actually reads). Copied verbatim
// so the two never drift; if you edit one, copy the change to the other.
//
// "Audit aurora" — a domain-warped flow field in the app's own dark
// palette, with a mouse-lean, film grain, vignette, and a targeted
// darkening scrim that guarantees the headline stays readable no matter
// what the flow field is doing underneath it. The domain-warping
// *technique* (fbm-of-fbm, the "q"/"r" naming) is the well-known Inigo
// Quilez pattern used across generative-art shader writing; the palette,
// mouse response, scrim math, and every uniform wire-up are specific to
// this product and are commented block-by-block below.

precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

// ---- noise building blocks ----
// hash: turns a 2D point into a pseudo-random 0..1 value (no real math
// meaning, just chaotic enough to look random and cheap enough per-pixel).
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// noise: samples hash() at the 4 corners of the grid cell containing p,
// then blends between them with a smooth (not linear) curve so the
// result has no visible grid lines.
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// fbm (fractal brownian motion): layers several octaves of noise() at
// shrinking scale/strength. This is what turns blobby noise into
// something that reads as organic, cloud-like flow instead of static.
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// ---- color palette ----
// The product's own real dark-theme colors, not a generic gradient —
// base page background, primary accent, success accent, warning accent.
vec3 colorBase   = vec3(0.043, 0.055, 0.078); // #0B0E14
vec3 colorIndigo = vec3(0.486, 0.612, 1.000); // #7C9CFF
vec3 colorGreen  = vec3(0.310, 0.820, 0.647); // #4FD1A5
vec3 colorAmber  = vec3(0.910, 0.706, 0.302); // #E8B44D

void main() {
  // ---- coordinate / UV normalization ----
  // gl_FragCoord is in raw pixels (0..width, 0..height). Subtracting half
  // the resolution moves the origin to the center of the screen; dividing
  // by u_resolution.y only (not x) keeps the pattern's proportions correct
  // instead of stretching it on a wide or narrow canvas.
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Same normalization applied to the mouse position, so it lives in the
  // same coordinate space as p and distances between them mean something.
  vec2 mouseP = (u_mouse - 0.5 * u_resolution) / u_resolution.y;

  // ---- mouse influence ----
  // A gentle pull of the sample point toward the cursor — not a sharp
  // distortion around it, just a slow directional lean, clamped so a
  // cursor far in a corner can't drag the sample point too far from
  // where it would naturally sit.
  vec2 towardMouse = clamp(mouseP - p, -0.6, 0.6);
  vec2 samplePoint = p + towardMouse * 0.15;

  // ---- time-based movement ----
  // u_time (seconds since the shader started, paused when the tab is
  // hidden — see ShaderHero.tsx) scaled way down: 0.06 keeps the whole
  // flow slow and ambient rather than busy or distracting.
  float t = u_time * 0.06;

  // ---- aurora / field calculation ----
  // Three-layer domain warp: fbm of a point that's itself offset by
  // another fbm, offset again by a third. Each layer of warping is what
  // gives the result its flowing, aurora-like curl instead of flat cloud
  // noise. samplePoint (not p) is used here, so the mouse lean above
  // actually shifts what the flow field looks like, not just a separate
  // overlay on top of it.
  vec2 q = vec2(
    fbm(samplePoint + t),
    fbm(samplePoint + vec2(5.2, 1.3) + t)
  );

  vec2 r = vec2(
    fbm(samplePoint + 3.5 * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(samplePoint + 3.5 * q + vec2(8.3, 2.8) + 0.13 * t)
  );

  float field = fbm(samplePoint + 3.0 * r);

  // ---- final composition ----
  // Walk through the palette based on the field value: base color for
  // calm regions, indigo for the main body of the flow, green picking out
  // the brightest ridges, amber as a rare, sparing highlight only where
  // the warp vector r is largest.
  vec3 col = mix(colorBase, colorIndigo, smoothstep(0.15, 0.75, field));
  col = mix(col, colorGreen, smoothstep(0.45, 0.95, field));
  float amberPocket = smoothstep(0.55, 0.9, length(r));
  col = mix(col, colorAmber, amberPocket * 0.35);

  // Vignette: darkens the far corners so this reads as a framed hero
  // rather than a flat tiled pattern.
  float vignette = smoothstep(1.0, 0.25, length(p));
  col *= mix(0.55, 1.0, vignette);

  // Headline scrim: extra darkening centered on where the headline text
  // sits (uv.y ≈ 0.5), fading out toward the top/bottom edges. This is a
  // computed contrast guarantee, not a guess — see hero/README.md for the
  // exact worst-case WCAG math behind the 0.35 factor below.
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float distFromCenter = abs(uv.y - 0.5);
  float scrimStrength = 1.0 - smoothstep(0.0, 0.35, distFromCenter);
  float scrim = mix(1.0, 0.35, scrimStrength);
  col *= scrim;

  // Film grain: cheap per-pixel dither to break up banding in smooth
  // gradient areas. Kept subtle (0.035) so it reads as texture, not noise.
  float grain = (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.035;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
