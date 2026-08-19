"use client";

import { Streamdown } from "streamdown";
import ThinkingIndicator from "./ThinkingIndicator";

export default function MessageBubble({ message, isStreaming, showThinking }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-br-sm bg-accent text-white px-4 py-2.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] sm:max-w-[75%] w-full">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center text-[10px] font-semibold shrink-0">
            AI
          </span>
          <span className="text-xs text-muted">Audit Assistant</span>
        </div>

        {/* ThinkingIndicator and the streamed text share this box so the
            transition between them is an opacity crossfade, not a mount/
            unmount swap — see ThinkingIndicator for why that matters. */}
        <div className="relative pl-7 min-h-[1.25rem] text-[15px] leading-relaxed">
          <ThinkingIndicator visible={showThinking} />
          {text && <Streamdown isAnimating={isStreaming}>{text}</Streamdown>}
        </div>
      </div>
    </div>
  );
}
