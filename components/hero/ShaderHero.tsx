'use client';

import { useEffect, useRef } from 'react';

// Inlined rather than imported from hero.vert.glsl / hero.frag.glsl —
// Next's default webpack config has no loader for raw .glsl imports, and
// adding one is more moving parts than this needs. The two files still
// exist alongside this one as the documented, readable source for the
// "shader source with comments" deliverable; keep them in sync by hand if
// you edit either.

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
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
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[ShaderHero] shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderHero({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) {
      // No WebGL — the CSS gradient already sitting behind the canvas
      // (set inline below) stays visible as the fallback; nothing else
      // to do here.
      return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[ShaderHero] program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Big-triangle fullscreen trick (see hero.vert.glsl for why).
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');

    // Mouse position in the shader's coordinate space (WebGL pixels,
    // origin bottom-left). Starts centered so there's no jump on first
    // paint before any pointer movement.
    let mouseX = 0;
    let mouseY = 0;
    let hasResolution = false;

    function resize() {
      // Cap devicePixelRatio at 2 — an uncapped dpr on a high-density
      // phone screen multiplies every fragment-shader invocation for
      // visual return that isn't perceptible much past this point.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth, clientHeight } = canvas;
      const width = Math.round(clientWidth * dpr);
      const height = Math.round(clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl!.viewport(0, 0, width, height);
      }
      if (!hasResolution) {
        mouseX = width / 2;
        mouseY = height / 2;
        hasResolution = true;
      }
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    function updateMouseFromClient(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      mouseX = (clientX - rect.left) * dpr;
      // Flip Y: DOM origin is top-left, GL fragment-coordinate origin is
      // bottom-left.
      mouseY = (rect.height - (clientY - rect.top)) * dpr;
    }
    function onPointerMove(e: PointerEvent) {
      updateMouseFromClient(e.clientX, e.clientY);
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let rafId: number | null = null;
    let startTime = performance.now();
    let pausedElapsedSeconds = 0;

    function currentElapsed() {
      return (performance.now() - startTime) / 1000;
    }

    function drawFrame(elapsedSeconds: number) {
      gl!.uniform1f(timeLoc, elapsedSeconds);
      gl!.uniform2f(resolutionLoc, canvas.width, canvas.height);
      gl!.uniform2f(mouseLoc, mouseX, mouseY);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function loop() {
      drawFrame(currentElapsed());
      rafId = requestAnimationFrame(loop);
    }

    if (reducedMotion) {
      // One static frame at t=0, no animation loop at all — the same
      // shader and palette as the animated version, just frozen, rather
      // than a separate hardcoded gradient to maintain in parallel.
      drawFrame(0);
    } else {
      // Pause entirely when the tab isn't visible, rather than relying on
      // the browser's own (looser, ~1fps) background-tab rAF throttling —
      // no point burning any GPU cycles on a hero nobody's looking at.
      // Tracks elapsed time explicitly across the pause so the flow field
      // resumes smoothly instead of jumping back to t=0.
      function handleVisibility() {
        if (document.hidden) {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
            pausedElapsedSeconds = currentElapsed();
          }
        } else if (rafId === null) {
          startTime = performance.now() - pausedElapsedSeconds * 1000;
          loop();
        }
      }
      document.addEventListener('visibilitychange', handleVisibility);
      loop();

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('pointermove', onPointerMove);
        resizeObserver.disconnect();
      };
    }

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        // Static CSS gradient underneath the canvas, in the same palette —
        // visible instantly on first paint before WebGL init completes,
        // and stays as the real fallback if WebGL context creation fails.
        background:
          'radial-gradient(120% 100% at 50% 0%, #12151c 0%, #0b0e14 60%, #0b0e14 100%)',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
