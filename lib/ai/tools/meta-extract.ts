/**
 * SEO metadata extraction and scoring for fetchMetaTags.
 *
 * Replaces the earlier regexes, which failed on valid HTML: they required
 * `name` before `content` (and `rel` before `href`), stopped at any quote
 * character inside a value, ignored unquoted attributes, matched only one of
 * `name=`/`property=`, and never decoded entities.
 *
 * This is a small tag scanner, not a full HTML5 parser. It follows the parts
 * of the HTML tokenizer that matter here: comments and doctype are skipped,
 * `<script>`/`<style>` bodies are skipped, `<title>` is read as raw text,
 * attributes may be double-quoted, single-quoted or unquoted, names are
 * case-insensitive and the first occurrence of a duplicate attribute wins.
 * Malformed input never throws: an unterminated tag or quote simply ends
 * the scan, as a browser would swallow the rest of the document.
 *
 * Deliberate limits (documented, not hidden):
 *  - only the HTML we are handed is examined. Tags added by JavaScript, and
 *    the X-Robots-Tag HTTP header, are invisible to this tool;
 *  - only the common named entities below are decoded; others are left as-is;
 *  - tag-specific robots meta (googlebot, bingbot, ...) is not interpreted.
 */

export type MetaTags = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  twitterCard: string | null;
};

export type Finding = { label: string; pass: boolean; value: string | null };

// ---- entity decoding -----------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  bull: '\u2022',
  middot: '\u00b7',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  deg: '\u00b0',
  times: '\u00d7',
  eacute: '\u00e9',
  egrave: '\u00e8',
  agrave: '\u00e0',
  uuml: '\u00fc',
  ouml: '\u00f6',
  auml: '\u00e4',
  ntilde: '\u00f1',
  ccedil: '\u00e7',
};

function codePointToString(code: number): string {
  // Out-of-range, surrogate, or NUL code points become U+FFFD, as in HTML.
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    return '\ufffd';
  }
  return String.fromCodePoint(code);
}

/** Decodes numeric (`&#38;`, `&#x26;`) and the common named entities. Unknown ones are kept. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,8}));/g, (match, dec, hex, name) => {
    if (dec !== undefined) return codePointToString(parseInt(dec, 10));
    if (hex !== undefined) return codePointToString(parseInt(hex, 16));
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : match;
  });
}

function clean(raw: string): string | null {
  const value = decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
  return value === '' ? null : value;
}

// ---- tag scanner ---------------------------------------------------------------

function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

function isAsciiLetter(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
}

type ScannedTag = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  /** Lower-cased attribute names; first occurrence wins; values are raw (undecoded). */
  attrs: Map<string, string>;
  /** Index just after the tag's closing `>`. */
  end: number;
};

/** Reads one tag starting at html[start] === '<'. Returns null if it is not a complete tag. */
function readTag(html: string, start: number): ScannedTag | null {
  const n = html.length;
  const closing = html[start + 1] === '/';
  let i = start + (closing ? 2 : 1);
  if (!isAsciiLetter(html[i])) return null;

  const nameStart = i;
  while (i < n && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>') i += 1;
  const name = html.slice(nameStart, i).toLowerCase();

  const attrs = new Map<string, string>();
  let selfClosing = false;

  while (i < n) {
    while (i < n && (isSpace(html[i]) || html[i] === '/')) {
      if (html[i] === '/') selfClosing = true;
      i += 1;
    }
    if (i >= n) return null; // unterminated tag
    if (html[i] === '>') {
      return { name, closing, selfClosing, attrs, end: i + 1 };
    }
    selfClosing = false;

    const attrStart = i;
    i += 1; // always consume at least one character, so malformed input cannot loop
    while (i < n && !isSpace(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i += 1;
    const attrName = html.slice(attrStart, i).toLowerCase();

    while (i < n && isSpace(html[i])) i += 1;
    let value = '';
    if (html[i] === '=') {
      i += 1;
      while (i < n && isSpace(html[i])) i += 1;
      const quote = html[i];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, i + 1);
        if (close === -1) return null; // unterminated quote swallows the rest, like a browser
        value = html.slice(i + 1, close);
        i = close + 1;
      } else {
        const valueStart = i;
        while (i < n && !isSpace(html[i]) && html[i] !== '>') i += 1;
        value = html.slice(valueStart, i);
      }
    }
    if (!attrs.has(attrName)) attrs.set(attrName, value);
  }
  return null;
}

/** Finds `</name` followed by a delimiter, case-insensitively, without changing string length. */
function findClosingTag(html: string, name: string, from: number): { start: number; end: number } | null {
  const re = new RegExp(`</${name}(?=[\\s/>])`, 'gi');
  re.lastIndex = from;
  const match = re.exec(html);
  if (!match) return null;
  const gt = html.indexOf('>', match.index);
  return { start: match.index, end: gt === -1 ? html.length : gt + 1 };
}

export function extractMetaTags(html: string): MetaTags {
  const meta = new Map<string, string>(); // lower-cased name/property -> first non-empty content
  let title: string | null = null;
  let canonical: string | null = null;
  let svgDepth = 0;
  // If no </title> exists after one <title>, none exists after a later one either.
  // Remembering that keeps hostile input (thousands of unclosed <title> tags in a
  // 2 MiB page) linear instead of re-scanning the whole document for each tag.
  let titleUnclosed = false;

  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close === -1 ? n : close + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const gt = html.indexOf('>', lt + 2);
      i = gt === -1 ? n : gt + 1;
      continue;
    }

    const tag = readTag(html, lt);
    if (!tag) {
      // Either not a tag at all ("a < b") or an unterminated one.
      const looksLikeTag = isAsciiLetter(html[lt + 1]) || (html[lt + 1] === '/' && isAsciiLetter(html[lt + 2]));
      if (looksLikeTag) break; // unterminated tag: the rest of the document is unreadable
      i = lt + 1;
      continue;
    }
    i = tag.end;

    if (tag.name === 'svg') {
      if (tag.closing) svgDepth = Math.max(0, svgDepth - 1);
      else if (!tag.selfClosing) svgDepth += 1;
      continue;
    }
    if (tag.closing) continue;

    if (tag.name === 'script' || tag.name === 'style') {
      const close = findClosingTag(html, tag.name, i);
      i = close ? close.end : n;
      continue;
    }

    if (tag.name === 'title') {
      if (titleUnclosed) continue;
      const close = findClosingTag(html, 'title', i);
      if (!close) {
        titleUnclosed = true;
        continue;
      }
      if (title === null && svgDepth === 0) title = clean(html.slice(i, close.start));
      i = close.end;
      continue;
    }

    if (tag.name === 'meta') {
      const content = tag.attrs.has('content') ? clean(tag.attrs.get('content') as string) : null;
      if (content !== null) {
        // A tag may be addressed by either attribute: both are accepted for every key.
        for (const attr of ['name', 'property']) {
          const key = tag.attrs.get(attr)?.trim().toLowerCase();
          if (key && !meta.has(key)) meta.set(key, content);
        }
      }
      continue;
    }

    if (tag.name === 'link' && canonical === null) {
      const rel = (tag.attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('canonical')) canonical = clean(tag.attrs.get('href') ?? '');
    }
  }

  return {
    title,
    description: meta.get('description') ?? null,
    canonical,
    robots: meta.get('robots') ?? null,
    ogTitle: meta.get('og:title') ?? null,
    // og:image:url and og:image:secure_url are defined by the Open Graph protocol
    // as alternate spellings of the image URL.
    ogImage: meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('og:image:secure_url') ?? null,
    twitterCard: meta.get('twitter:card') ?? null,
  };
}

// ---- scoring ---------------------------------------------------------------------

export const TITLE_MIN = 10;
export const TITLE_MAX = 60;

/**
 * Scoring policy (unchanged weights, 100 points in total): the score is a
 * PRESENCE checklist. Rows below the checklist (title length, robots) are
 * advisory findings: they are reported honestly but do not change the score.
 * A row is only produced when its underlying data exists, so a check is never
 * reported as passed (or failed) on missing data.
 */
export function scoreTags(tags: MetaTags): { score: number; findings: Finding[] } {
  const checks: { key: keyof MetaTags; label: string; weight: number }[] = [
    { key: 'title', label: 'Title tag present', weight: 20 },
    { key: 'description', label: 'Meta description present', weight: 20 },
    { key: 'canonical', label: 'Canonical link present', weight: 15 },
    { key: 'ogTitle', label: 'Open Graph title present', weight: 15 },
    { key: 'ogImage', label: 'Open Graph image present', weight: 15 },
    { key: 'twitterCard', label: 'Twitter card declared', weight: 15 },
  ];

  let score = 0;
  const findings: Finding[] = checks.map((check) => {
    const value = tags[check.key];
    const pass = !!value;
    if (pass) score += check.weight;
    return { label: check.label, pass, value };
  });

  if (tags.title) {
    const length = Array.from(tags.title).length;
    findings.push({
      label: `Title length within ${TITLE_MIN}-${TITLE_MAX} chars`,
      pass: length >= TITLE_MIN && length <= TITLE_MAX,
      value: `${length} chars (not scored)`,
    });
  }

  if (tags.robots) {
    const directives = tags.robots.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const noindex = directives.includes('noindex') || directives.includes('none');
    const nofollow = directives.includes('nofollow') || directives.includes('none');
    if (noindex) {
      findings.push({ label: 'Indexing allowed (robots noindex found)', pass: false, value: tags.robots });
    }
    if (nofollow) {
      findings.push({ label: 'Link following allowed (robots nofollow found)', pass: false, value: tags.robots });
    }
    if (!noindex && !nofollow) {
      findings.push({ label: 'Robots meta allows indexing and link following', pass: true, value: tags.robots });
    }
  }

  return { score, findings };
}
