import { ShaderHero } from '../hero/ShaderHero';

export default function EmptyState() {
  return (
    <div className="pb-4">
      <ShaderHero>
        <div className="px-1 pt-12 pb-10">
          <p className="text-xs uppercase tracking-widest text-[#7C9CFF] font-semibold mb-2">
            Audit Assistant
          </p>
          <h2 className="text-2xl font-semibold text-[#E7E9EE] mb-0 max-w-md">
            Paste a page in, get a prioritized SEO audit back.
          </h2>
        </div>
      </ShaderHero>
      <div className="pt-4">
        <p className="text-sm text-[#8891A3] max-w-md leading-relaxed mb-6">
          This can't fetch a URL on its own yet — paste the page's title tag,
          meta description, headings, and body text (or the full HTML) and
          it'll stream back what's working, what isn't, and what to fix first.
        </p>
        <div className="space-y-2 max-w-md">
          <p className="text-xs text-[#8891A3] font-medium">Try something like:</p>
          <p className="text-sm text-[#C4C9D4] border border-[#262B36] rounded-lg px-3 py-2 bg-[#12151C]">
            "Title: Home | Acme Co. — Meta: (none) — H1: Welcome to our
            website — audit this."
          </p>
        </div>
      </div>
    </div>
  );
}
