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
        <p className="text-sm text-[#8891A3] max-w-md leading-relaxed mb-3">
          Enter a public page URL and it fetches the page&rsquo;s title tag,
          meta description, canonical link, robots, Open Graph and Twitter
          card tags, scores them out of 100, then explains what&rsquo;s
          working and what to fix first.
        </p>
        <p className="text-xs text-[#8891A3] max-w-md leading-relaxed mb-6">
          Public web pages only: private or internal addresses, unusual
          ports, and non-HTML files are rejected.
        </p>
        <div className="space-y-2 max-w-md">
          <p className="text-xs text-[#8891A3] font-medium">Try something like:</p>
          <p className="text-sm text-[#C4C9D4] border border-[#262B36] rounded-lg px-3 py-2 bg-[#12151C]">
            https://example.com
          </p>
        </div>
      </div>
    </div>
  );
}
