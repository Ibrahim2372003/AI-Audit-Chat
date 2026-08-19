"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 48;

/**
 * Keeps a scroll container pinned to the bottom *only* while the user is
 * already there. The moment they scroll up — including mid-stream, while
 * tokens are still arriving — the pin releases and stays released until
 * they either scroll back down themselves or call `scrollToBottom()`
 * (wired to a "Jump to latest" button).
 *
 * `watch` is a dependency array (typically `[messages]`) that changes on
 * every streamed token, which is what triggers the re-pin check.
 */
export function useStickToBottom(watch) {
  const containerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
  }, []);

  // Track the user's own scrolling so we know whether to keep pinning.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onScroll = () => setIsAtBottom(checkAtBottom());
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkAtBottom]);

  // Re-pin on every update to `watch` — but only if we were already at the
  // bottom. This is what makes streaming text follow the pin without
  // fighting a user who scrolled up to re-read something.
  useEffect(() => {
    if (isAtBottom) {
      containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
  }, []);

  return { containerRef, isAtBottom, scrollToBottom };
}
