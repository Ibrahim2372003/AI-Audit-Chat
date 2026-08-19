"use client";

import { useState } from "react";
import { useAutoGrowTextarea } from "./hooks/useAutoGrowTextarea";

export default function ChatComposer({ status, onSend, onStop }) {
  const [value, setValue] = useState("");
  const textareaRef = useAutoGrowTextarea(value);
  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter makes a new line — standard chat-input
    // behavior, and doesn't fight mobile soft keyboards (which don't fire
    // this handler for their own "send"/"done" keys anyway).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-line bg-paper px-3 sm:px-4 pt-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Paste a URL, or the page's title/meta/headings/body…"
          aria-label="Message"
          // 16px min font-size keeps iOS Safari from auto-zooming on focus.
          className="flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-3 text-[16px] leading-snug placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 max-h-40"
        />

        {isBusy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="shrink-0 w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            <span className="w-3 h-3 bg-white rounded-[2px]" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="Send message"
            className="shrink-0 w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            <ArrowUpIcon />
          </button>
        )}
      </div>
      <p className="max-w-3xl mx-auto text-[11px] text-muted mt-2 hidden sm:block">
        Enter to send · Shift + Enter for a new line
      </p>
    </form>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}
