"use client";

/**
 * Shown before the first token of a reply arrives. Deliberately not a
 * separate step that gets unmounted and replaced — the caller keeps this
 * mounted alongside the (empty, then filling) text node and lets opacity
 * transitions do the handoff, so there's no one-frame flicker between
 * "thinking" and "typing".
 */
export default function ThinkingIndicator({ visible }) {
  return (
    <div
      aria-hidden={!visible}
      className={`flex items-center gap-1.5 h-5 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none absolute"
      }`}
    >
      <span className="sr-only">Assistant is thinking</span>
      <span className="think-dot w-1.5 h-1.5 rounded-full bg-muted" style={{ animationDelay: "0ms" }} />
      <span className="think-dot w-1.5 h-1.5 rounded-full bg-muted" style={{ animationDelay: "150ms" }} />
      <span className="think-dot w-1.5 h-1.5 rounded-full bg-muted" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
