/**
 * Everything about *how* we talk to the model lives here: which model,
 * what it's told to do, and the generation settings. One file, so FE-07
 * (which extends this same route handler) has one obvious place to add
 * tools, retrieved context, or swap models — instead of hunting through
 * the route handler for a scattered prompt string.
 */

// Sonnet is the default here: strong at structured, opinionated long-form
// writing (which is most of what an audit report is) without the latency
// of a bigger "thinking" model on every turn. Swap this string to try a
// different Claude model — nothing else in the app needs to change.
export const MODEL_ID = "claude-sonnet-4-6";

// The assistant only ever sees what the user pastes into the chat — this
// route has no web-fetch tool (that's deliberately out of scope for this
// task; see FE-07). The prompt is written to make that limitation obvious
// to the model, so it asks for content instead of pretending to have
// crawled a page it never saw.
export const SYSTEM_PROMPT = `
You are the SEO Audit Assistant inside the product's dashboard. A user pastes
a URL and/or raw page content — title tag, meta description, headings, body
copy, or full HTML — into this chat and expects a clear, prioritized SEO
audit back.

You cannot browse the web or fetch pages yourself. Work only from what the
user has actually pasted into the conversation. If they give you a URL with
no page content, don't guess at what the page contains — ask them to paste
the title tag, meta description, headings, and main body text (or the full
HTML source) before you audit anything.

Once you do have real content to work with, structure your response as
Markdown:

1. **Quick take** — one or two sentences on overall health.
2. **What's working** — a short bullet list, only if something genuinely is.
3. **Issues, by priority** — group as Critical / Moderate / Minor. For each:
   what's wrong, why it matters, and the concrete fix (not generic advice).
4. **Suggested title tag & meta description** — only if the current ones are
   weak or missing, and only as real replacement copy, not a template.

Reference the actual copy you were given. If something wasn't provided (e.g.
no meta description in what was pasted), say so plainly rather than
inventing one. Keep the tone direct and specific, like a colleague handing
over real findings — not a generic "10 SEO tips" listicle.
`.trim();

// Generation settings, kept separate from the prompt so they're easy to
// tune without touching the copy above.
export const MODEL_SETTINGS = {
  // Lower than default: audits should read as consistent, structured
  // findings, not creative writing. Not fully deterministic (0), since
  // some phrasing variety across runs is fine and a bit more natural.
  temperature: 0.4,
  // Full audits can run long — give the model enough room to finish every
  // section instead of getting cut off mid-recommendation.
  maxOutputTokens: 2000,
};
