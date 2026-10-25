import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities, extractMetaTags, scoreTags } from '../meta-extract';
import { runFetchMetaTags } from '../fetch-meta-tags';

const T = '<title>A perfectly reasonable page title</title>';
const head = (inner: string) => `<!doctype html><html><head>${inner}</head><body></body></html>`;

describe('attribute ORDER no longer matters', () => {
  it.each([
    ['name, content', '<meta name="description" content="Hello">'],
    ['content, name', '<meta content="Hello" name="description">'],
    ['name, id, content', '<meta name="description" id="d" content="Hello">'],
    ['id, content, name', '<meta id="d" content="Hello" name="description">'],
    ['content, id, class, name', '<meta content="Hello" id="d" class="x" name="description">'],
    ['self-closing', '<meta content="Hello" name="description" />'],
    ['upper-case tag and attribute names', '<META CONTENT="Hello" NAME="description">'],
    ['whitespace around =', '<meta name = "description"  content = "Hello" >'],
  ])('description: %s', (_label, tag) => {
    expect(extractMetaTags(head(T + tag)).description).toBe('Hello');
  });

  it.each([
    ['rel, href', '<link rel="canonical" href="https://example.test/">'],
    ['href, rel', '<link href="https://example.test/" rel="canonical">'],
    ['extra attributes between', '<link rel="canonical" id="c" href="https://example.test/">'],
    ['rel with several tokens', '<link rel="Canonical nofollow" href="https://example.test/">'],
    ['upper-case rel value', '<link href="https://example.test/" rel="CANONICAL">'],
  ])('canonical: %s', (_label, tag) => {
    expect(extractMetaTags(head(T + tag)).canonical).toBe('https://example.test/');
  });

  it.each([
    ['ogTitle', '<meta content="OG T" property="og:title">', 'OG T'],
    ['ogImage', '<meta content="https://x.test/i.png" property="og:image">', 'https://x.test/i.png'],
    ['twitterCard', '<meta content="summary" name="twitter:card">', 'summary'],
    ['robots', '<meta content="index, follow" name="robots">', 'index, follow'],
  ])('%s with content before the key attribute', (key, tag, expected) => {
    expect((extractMetaTags(head(T + tag)) as any)[key]).toBe(expected);
  });

  it('gives an identical result for every ordering of a complete tag set', () => {
    const perfect = [
      '<meta name="description" content="d">',
      '<link rel="canonical" href="https://example.test/">',
      '<meta property="og:title" content="t">',
      '<meta property="og:image" content="https://x.test/i.png">',
      '<meta name="twitter:card" content="summary">',
    ];
    const reversed = [
      '<meta content="d" name="description">',
      '<link href="https://example.test/" rel="canonical">',
      '<meta content="t" property="og:title">',
      '<meta content="https://x.test/i.png" property="og:image">',
      '<meta content="summary" name="twitter:card">',
    ];
    const a = scoreTags(extractMetaTags(head(T + perfect.join(''))));
    const b = scoreTags(extractMetaTags(head(T + reversed.join(''))));
    const c = scoreTags(extractMetaTags(head(T + [...reversed].reverse().join(''))));
    expect(a.score).toBe(100);
    expect(b).toEqual(a);
    expect(c.score).toBe(100);
  });
});

describe('quoting styles, apostrophes and embedded quotes', () => {
  it('handles double, single and unquoted attribute values', () => {
    expect(extractMetaTags(head(T + '<meta name="description" content="Hello">')).description).toBe('Hello');
    expect(extractMetaTags(head(T + "<meta name='description' content='Hello'>")).description).toBe('Hello');
    expect(extractMetaTags(head(T + '<meta name=description content=Hello>')).description).toBe('Hello');
    expect(extractMetaTags(head(T + `<meta name='description' content="Hello">`)).description).toBe('Hello');
  });

  it('keeps an apostrophe inside a double-quoted value (was truncated to "Don")', () => {
    const tags = extractMetaTags(head(T + `<meta name="description" content="Don't miss our guide">`));
    expect(tags.description).toBe("Don't miss our guide");
  });

  it('keeps double quotes inside a single-quoted value (was truncated to "He said")', () => {
    const tags = extractMetaTags(head(T + `<meta name="description" content='He said "hi" today'>`));
    expect(tags.description).toBe('He said "hi" today');
  });

  it('does not end the tag at a ">" inside a quoted value', () => {
    const tags = extractMetaTags(head(T + '<meta name="description" content="a > b and c < d"><meta name="robots" content="noindex">'));
    expect(tags.description).toBe('a > b and c < d');
    expect(tags.robots).toBe('noindex');
  });

  it('ends an unquoted value at whitespace, per the HTML tokenizer', () => {
    expect(extractMetaTags(head(T + '<meta name=description content=Hello world>')).description).toBe('Hello');
  });

  it('lets the first occurrence of a duplicated attribute win', () => {
    const tags = extractMetaTags(head(T + '<meta name="description" content="First" content="Second">'));
    expect(tags.description).toBe('First');
  });

  it('uses the first NON-EMPTY content when a key is repeated', () => {
    const tags = extractMetaTags(head(T + '<meta name="description" content=""><meta name="description" content="Real one">'));
    expect(tags.description).toBe('Real one');
  });
});

describe('property= versus name= variants', () => {
  it.each([
    ['twitter:card via property=', '<meta property="twitter:card" content="summary">', 'twitterCard', 'summary'],
    ['twitter:card via name=', '<meta name="twitter:card" content="summary">', 'twitterCard', 'summary'],
    ['og:image via name=', '<meta name="og:image" content="https://x.test/i.png">', 'ogImage', 'https://x.test/i.png'],
    ['og:title via name=', '<meta name="og:title" content="T">', 'ogTitle', 'T'],
    ['og:title via property=', '<meta property="og:title" content="T">', 'ogTitle', 'T'],
    ['robots via property=', '<meta property="robots" content="noindex">', 'robots', 'noindex'],
    ['description via property=', '<meta property="description" content="D">', 'description', 'D'],
  ])('%s', (_label, tag, key, expected) => {
    expect((extractMetaTags(head(T + tag)) as any)[key]).toBe(expected);
  });

  it('accepts a tag that carries BOTH name= and property=', () => {
    const tags = extractMetaTags(head(T + '<meta name="description" property="og:description" content="Both">'));
    expect(tags.description).toBe('Both');
  });

  it('accepts og:image:url and og:image:secure_url as spellings of the image, preferring og:image', () => {
    expect(extractMetaTags(head(T + '<meta property="og:image:url" content="U">')).ogImage).toBe('U');
    expect(extractMetaTags(head(T + '<meta property="og:image:secure_url" content="S">')).ogImage).toBe('S');
    expect(
      extractMetaTags(head(T + '<meta property="og:image:url" content="U"><meta property="og:image" content="P">')).ogImage,
    ).toBe('P');
  });

  it('does not confuse og:description with description', () => {
    expect(extractMetaTags(head(T + '<meta property="og:description" content="X">')).description).toBeNull();
  });
});

describe('HTML entities', () => {
  it('decodes entities in the title (was returned raw)', () => {
    const tags = extractMetaTags('<title>Tom &amp; Jerry &mdash; the show</title>');
    expect(tags.title).toBe('Tom & Jerry — the show');
  });

  it.each([
    ['&amp;', '&'],
    ['&lt;b&gt;', '<b>'],
    ['&quot;q&quot; &apos;a&apos;', '"q" \'a\''],
    ['&mdash; &ndash; &hellip;', '— – …'],
    ['&#8212;', '—'],
    ['&#x2014;', '—'],
    ['&#X2014;', '—'],
    ['&#0;', '\ufffd'],
    ['&#xD800;', '\ufffd'],
    ['&#9999999;', '\ufffd'],
    ['&notanentity;', '&notanentity;'],
    ['AT&T and no semicolon &amp', 'AT&T and no semicolon &amp'],
    ['&amp;amp;', '&amp;'], // decoded exactly once
  ])('decodeHtmlEntities(%j)', (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });

  it('decodes entities in attribute values, including URLs', () => {
    const tags = extractMetaTags(
      head(T + '<meta name="description" content="Fish &amp; chips &mdash; Don&#39;t miss"><link rel="canonical" href="https://x.test/?a=1&amp;b=2">'),
    );
    expect(tags.description).toBe("Fish & chips — Don't miss");
    expect(tags.canonical).toBe('https://x.test/?a=1&b=2');
  });

  it('measures title length AFTER decoding', () => {
    const encoded = '&amp;'.repeat(8); // 40 raw chars, 8 decoded chars
    const { findings } = scoreTags(extractMetaTags(`<title>${encoded}</title>`));
    const row = findings.find((f) => /length/i.test(f.label))!;
    expect(row.pass).toBe(false);
    expect(row.value).toBe('8 chars (not scored)');
  });
});

describe('title extraction', () => {
  it('collapses whitespace and handles upper-case tags and attributes', () => {
    expect(extractMetaTags('<TITLE data-x="1">\n  Hello\n   world \n</TITLE>').title).toBe('Hello world');
  });

  it('uses the first non-empty title and ignores SVG titles', () => {
    expect(extractMetaTags('<title>First</title><title>Second</title>').title).toBe('First');
    expect(extractMetaTags('<svg><title>Logo</title></svg><title>Real</title>').title).toBe('Real');
    expect(extractMetaTags('<svg/><title>After self-closed svg</title>').title).toBe('After self-closed svg');
  });

  it('treats an empty or unclosed title as absent', () => {
    expect(extractMetaTags('<title></title>').title).toBeNull();
    expect(extractMetaTags('<title>   </title>').title).toBeNull();
    expect(extractMetaTags('<title>never closed <meta name="description" content="x">').title).toBeNull();
  });

  it('ignores tags inside comments, scripts and styles', () => {
    const html = head(
      '<!-- <title>Commented</title><meta name="description" content="commented"> -->' +
        '<script>var a = "<title>InScript</title><meta name=\'description\' content=\'script\'>";</script>' +
        '<style>/* <title>InStyle</title> */</style>' +
        '<title>Actual</title><meta name="description" content="actual">',
    );
    const tags = extractMetaTags(html);
    expect(tags.title).toBe('Actual');
    expect(tags.description).toBe('actual');
  });
});

describe('robots findings (advisory, never change the score)', () => {
  const perfect =
    T +
    '<meta name="description" content="d"><link rel="canonical" href="https://x.test/">' +
    '<meta property="og:title" content="t"><meta property="og:image" content="i"><meta name="twitter:card" content="summary">';
  const robotsRows = (content: string) =>
    scoreTags(extractMetaTags(head(perfect + `<meta name="robots" content="${content}">`)));

  it('reports noindex and nofollow as separate failing findings, leaving the score alone', () => {
    const r = robotsRows('noindex, nofollow');
    expect(r.score).toBe(100);
    const labels = r.findings.filter((f) => !f.pass).map((f) => f.label);
    expect(labels).toEqual([
      'Indexing allowed (robots noindex found)',
      'Link following allowed (robots nofollow found)',
    ]);
    expect(r.findings.filter((f) => /robots/i.test(f.label)).every((f) => f.value === 'noindex, nofollow')).toBe(true);
  });

  it.each([
    ['noindex only', 'noindex', ['Indexing allowed (robots noindex found)']],
    ['nofollow only', 'nofollow', ['Link following allowed (robots nofollow found)']],
    ['mixed case', 'NoIndex,NoFollow', ['Indexing allowed (robots noindex found)', 'Link following allowed (robots nofollow found)']],
    ['whitespace separated', 'noindex nofollow', ['Indexing allowed (robots noindex found)', 'Link following allowed (robots nofollow found)']],
    ['"none" means both', 'none', ['Indexing allowed (robots noindex found)', 'Link following allowed (robots nofollow found)']],
    ['with other directives', 'max-snippet:50, noindex', ['Indexing allowed (robots noindex found)']],
  ])('%s', (_label, content, expectedFailures) => {
    const r = robotsRows(content);
    expect(r.score).toBe(100);
    expect(r.findings.filter((f) => !f.pass).map((f) => f.label)).toEqual(expectedFailures);
  });

  it('reports a passing row only when a robots tag exists and allows indexing', () => {
    const r = robotsRows('index, follow');
    expect(r.findings.every((f) => f.pass)).toBe(true);
    expect(r.findings.find((f) => /robots/i.test(f.label))?.label).toBe('Robots meta allows indexing and link following');
  });

  it('does not invent a robots finding when there is no robots tag', () => {
    const r = scoreTags(extractMetaTags(head(perfect)));
    expect(r.findings.some((f) => /robots|index/i.test(f.label))).toBe(false);
  });
});

describe('title length feedback is consistent with the scoring policy', () => {
  const lengthRow = (title: string) =>
    scoreTags(extractMetaTags(`<title>${title}</title>`)).findings.find((f) => /length/i.test(f.label));

  it('always reports a length row when a title exists, and says it is not scored', () => {
    expect(lengthRow('x'.repeat(9))).toEqual({ label: 'Title length within 10-60 chars', pass: false, value: '9 chars (not scored)' });
    expect(lengthRow('x'.repeat(10))).toEqual({ label: 'Title length within 10-60 chars', pass: true, value: '10 chars (not scored)' });
    expect(lengthRow('x'.repeat(60))?.pass).toBe(true);
    expect(lengthRow('x'.repeat(61))?.pass).toBe(false);
    expect(lengthRow('Hi')?.pass).toBe(false);
  });

  it('never lets length change the score: a 2-char title still earns the presence points', () => {
    expect(scoreTags(extractMetaTags('<title>Hi</title>')).score).toBe(20);
    expect(scoreTags(extractMetaTags(`<title>${'x'.repeat(200)}</title>`)).score).toBe(20);
  });

  it('counts code points, not UTF-16 units (31 emoji are 31 chars, not 62)', () => {
    expect(lengthRow('😀'.repeat(31))).toEqual({
      label: 'Title length within 10-60 chars',
      pass: true,
      value: '31 chars (not scored)',
    });
  });

  it('has no length row when there is no title', () => {
    expect(scoreTags(extractMetaTags('<html></html>')).findings.some((f) => /length/i.test(f.label))).toBe(false);
  });
});

describe('scoring weights are unchanged', () => {
  it.each([
    ['title', T, 20],
    ['description', '<meta name="description" content="d">', 20],
    ['canonical', '<link rel="canonical" href="https://x.test/">', 15],
    ['og:title', '<meta property="og:title" content="t">', 15],
    ['og:image', '<meta property="og:image" content="i">', 15],
    ['twitter:card', '<meta name="twitter:card" content="s">', 15],
  ])('%s alone is worth %i points', (_label, tag, points) => {
    expect(scoreTags(extractMetaTags(tag)).score).toBe(points);
  });
});

describe('empty, malformed and incomplete HTML', () => {
  const NONE = {
    title: null, description: null, canonical: null, robots: null, ogTitle: null, ogImage: null, twitterCard: null,
  };

  it.each([
    ['empty string', ''],
    ['plain text', 'just some words, no markup'],
    ['lone <', '<'],
    ['only <<<>>>', '<<<>>>'],
    ['text with comparison operators', 'if (a < b && c > d) { }'],
    ['doctype only', '<!doctype html>'],
    ['unterminated comment', '<!-- never closed <title>x</title>'],
    ['unterminated tag', '<meta name="description" content="x"'],
    ['unterminated quote', '<meta name="description" content="never closed'],
    ['tag with no name', '< meta name="description" content="x">'],
    ['closing tags only', '</title></head></html>'],
    ['meta without content', '<meta name="description">'],
    ['meta with empty content', '<meta name="description" content="">'],
    ['link without href', '<link rel="canonical">'],
  ])('%s yields no tags and does not throw', (_label, html) => {
    expect(extractMetaTags(html)).toEqual(NONE);
  });

  it('keeps tags that appear before an unterminated tag', () => {
    const tags = extractMetaTags('<title>Before</title><meta name="description" content="ok"><meta name="robots" content="broken');
    expect(tags.title).toBe('Before');
    expect(tags.description).toBe('ok');
    expect(tags.robots).toBeNull();
  });

  it('is not vulnerable to prototype-pollution style keys', () => {
    const tags = extractMetaTags('<meta name="__proto__" content="x"><meta name="constructor" content="y"><meta name="description" content="d">');
    expect(tags.description).toBe('d');
    expect(({} as any).x).toBeUndefined();
  });

  it('stays fast on pathological input', () => {
    // Includes ~2 MiB pages (the fetch size cap) of unclosed <title> tags, which re-scanned
    // the whole document per tag (quadratic: ~7 s for 50k tags) before the fix.
    const inputs = [
      '<a '.repeat(100_000),
      '<'.repeat(300_000),
      '<meta '.repeat(50_000),
      '<title>'.repeat(300_000),
      '<title>x</title>'.repeat(130_000),
      '<script>'.repeat(260_000),
      '<!--'.repeat(500_000),
    ];
    const started = Date.now();
    for (const input of inputs) extractMetaTags(input);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('honest results when extraction yields insufficient data', () => {
  it('scores 0 with every row failing and no invented extras', () => {
    const r = scoreTags(extractMetaTags('<html><head></head><body>no tags</body></html>'));
    expect(r.score).toBe(0);
    expect(r.findings).toHaveLength(6);
    expect(r.findings.every((f) => !f.pass && f.value === null)).toBe(true);
  });
});

describe('through the tool (the production path)', () => {
  const run = (html: string) =>
    runFetchMetaTags('https://example.test/', {
      fetchHtml: async () => ({ html, finalUrl: 'https://example.test/', truncated: false }),
      log: () => {},
    });

  it('scores 100 for a complete page whose attributes are in "unusual" order', async () => {
    const result = await run(
      head(
        T +
          `<meta content="Don't miss &amp; learn" name="description">` +
          '<link href="https://example.test/" rel="canonical">' +
          '<meta content="OG" property="og:title"><meta content="i" name="og:image"><meta content="summary" property="twitter:card">',
      ),
    );
    expect(result.score).toBe(100);
    expect(result.tags.description).toBe("Don't miss & learn");
  });

  it('keeps the response contract: url, fetchedAt, tags (7 keys), score, findings', async () => {
    const result = await run('<html></html>');
    expect(Object.keys(result).sort()).toEqual(['fetchedAt', 'findings', 'score', 'tags', 'url']);
    expect(Object.keys(result.tags)).toEqual(['title', 'description', 'canonical', 'robots', 'ogTitle', 'ogImage', 'twitterCard']);
  });

  it('flags noindex through the tool without changing the score', async () => {
    const result = await run(head(T + '<meta name="robots" content="noindex">'));
    expect(result.score).toBe(20);
    expect(result.findings.some((f) => !f.pass && /noindex/i.test(f.label))).toBe(true);
  });
});
