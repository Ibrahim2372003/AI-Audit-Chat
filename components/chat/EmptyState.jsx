export default function EmptyState() {
  return (
    <div className="pt-10 pb-4">
      <p className="text-[10px] uppercase tracking-widest text-accent font-semibold mb-2">
        Audit Assistant
      </p>
      <h2 className="text-2xl font-semibold text-ink mb-2 max-w-md">
        Paste a page in, get a prioritized SEO audit back.
      </h2>
      <p className="text-sm text-muted max-w-md leading-relaxed mb-6">
        This can't fetch a URL on its own yet — paste the page's title tag,
        meta description, headings, and body text (or the full HTML) and
        it'll stream back what's working, what isn't, and what to fix first.
      </p>
      <div className="space-y-2 max-w-md">
        <p className="text-xs text-muted font-medium">Try something like:</p>
        <p className="text-sm text-ink/70 border border-line rounded-lg px-3 py-2 bg-paper">
          "Title: Home | Acme Co. — Meta: (none) — H1: Welcome to our
          website — audit this."
        </p>
      </div>
    </div>
  );
}
