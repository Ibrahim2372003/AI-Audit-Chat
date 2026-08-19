"use client";

import { useEffect, useRef } from "react";

const MAX_HEIGHT_PX = 160;

/** Grows a textarea to fit its content, up to a cap, then scrolls. */
export function useAutoGrowTextarea(value) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  return ref;
}
