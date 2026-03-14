import { describe, expect, test } from 'vitest'
import { fromHtml } from './fromHtml.ts'

describe('fromHtml', () => {
  test('basic html conversion', async () => {
    const { content: result } = await fromHtml('<p>Hello</p>')
    expect(result).toBe('Hello\n')
  })

  test('converts heading and paragraph', async () => {
    const { content: result } = await fromHtml('<h1>Title</h1><p>Body</p>')
    expect(result).toContain('# Title')
    expect(result).toContain('Body')
  })

  test('converts links', async () => {
    const { content: result } = await fromHtml(
      '<a href="https://example.com">link</a>',
    )
    expect(result).toContain('[link](https://example.com)')
  })

  test('extracts title as meta', async () => {
    const { content, meta } = await fromHtml(
      html({ head: '<title>My Page</title>', body: '<p>content</p>' }),
    )
    expect(meta.title).toBe('My Page')
    expect(content).not.toContain('---')
  })

  test('extracts meta description', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta name="description" content="A description">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.description).toBe('A description')
  })

  test('extracts og:description as fallback', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta property="og:description" content="OG desc">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.description).toBe('OG desc')
  })

  test('name=description takes priority over og:description', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta name="description" content="Name desc"><meta property="og:description" content="OG desc">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.description).toBe('Name desc')
  })

  test('extracts author', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta name="author" content="John">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.author).toBe('John')
  })

  test('extracts og:site_name', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta property="og:site_name" content="My Site">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.site).toBe('My Site')
  })

  test('extracts article:published_time as publish_date', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta property="article:published_time" content="2024-01-15T00:00:00Z">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.publish_date).toBe('2024-01-15T00:00:00Z')
  })

  test('extracts date as publish_date', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta name="date" content="2024-03-01">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.publish_date).toBe('2024-03-01')
  })

  test('article:published_time takes priority over date', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<meta property="article:published_time" content="2024-01-15"><meta name="date" content="2024-03-01">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.publish_date).toBe('2024-01-15')
  })

  test('extracts canonical url', async () => {
    const { meta } = await fromHtml(
      html({
        head: '<link rel="canonical" href="https://example.com/page">',
        body: '<p>content</p>',
      }),
    )
    expect(meta.url).toBe('https://example.com/page')
  })

  test('no frontmatter when no head metadata', async () => {
    const { content } = await fromHtml('<p>text</p>')
    expect(content).not.toContain('---')
  })

  test('full document with all metadata', async () => {
    const { content, meta } = await fromHtml(
      html({
        head: [
          '<title>Full Page</title>',
          '<meta name="author" content="Jane">',
          '<meta name="description" content="Full description">',
          '<meta property="og:site_name" content="Full Site">',
          '<link rel="canonical" href="https://example.com/full">',
        ].join(''),
        body: '<h1>Welcome</h1><p>Hello world</p>',
      }),
    )
    expect(content).not.toContain('---')
    expect(meta.title).toBe('Full Page')
    expect(meta.author).toBe('Jane')
    expect(meta.description).toBe('Full description')
    expect(meta.site).toBe('Full Site')
    expect(meta.url).toBe('https://example.com/full')
    expect(content).toContain('# Welcome')
    expect(content).toContain('Hello world')
  })
})

describe('strips noise elements', () => {
  test('strips nav elements', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<nav><a href="/">Home</a></nav><p>Content</p>' }),
    )
    expect(result).toContain('Content')
    expect(result).toContain('Sitemap:')
    expect(result).toContain('[Home](/)')
  })

  test('preserves header elements', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<header><h1>Site Title</h1></header><main><p>Content</p></main>',
      }),
    )
    expect(result).toContain('Content')
    expect(result).toContain('Site Title')
  })

  test('strips skip-to-content links', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<a href="#main-content">Skip to main content</a><main id="main-content"><p>Content</p></main>',
      }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('Skip')
  })

  test('strips footer elements', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<p>Content</p><footer><p>Copyright 2024</p></footer>' }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('Copyright')
  })

  test('strips aside elements', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<aside><p>Sidebar</p></aside><p>Content</p>' }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('Sidebar')
  })

  test('strips script and style tags', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<script>alert("hi")</script><style>body{}</style><p>Content</p>',
      }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('alert')
    expect(result).not.toContain('body{}')
  })

  test('strips noscript and iframe', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<noscript>Enable JS</noscript><iframe src="x"></iframe><p>Content</p>',
      }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('Enable JS')
  })

  test('strips svg elements', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<svg><circle r="5"/></svg><p>Content</p>',
      }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('circle')
  })

  test('strips elements by role attribute', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<div role="navigation"><a href="/">Nav</a></div><div role="banner">Banner</div><div role="contentinfo">Info</div><div role="complementary">Side</div><p>Content</p>',
      }),
    )
    const [main, related] = result.split('Sitemap:')
    expect(main).toContain('Content')
    expect(main).not.toContain('Nav')
    expect(main).not.toContain('Banner')
    expect(main).not.toContain('Info')
    expect(main).not.toContain('Side')
    expect(related).toContain('[Nav](/)')
  })

  test('preserves main content', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<main><h1>Title</h1><p>Paragraph</p><ul><li>Item</li></ul></main>',
      }),
    )
    expect(result).toContain('# Title')
    expect(result).toContain('Paragraph')
    expect(result).toContain('Item')
  })

  test('strips nested noise', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav><article><p>Article content</p></article>',
      }),
    )
    const [main, related] = result.split('Sitemap:')
    expect(main).toContain('Article content')
    expect(main).not.toContain('Home')
    expect(main).not.toContain('About')
    expect(related).toContain('[Home](/)')
    expect(related).toContain('[About](/about)')
  })
})

describe('resolves relative links', () => {
  const baseUrl = 'https://example.com/docs/page'

  test('resolves relative href', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<a href="/about">About</a>' }),
      { baseUrl },
    )
    expect(result).toContain('[About](https://example.com/about)')
  })

  test('resolves relative src', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<img src="/img/photo.jpg" alt="Photo">' }),
      { baseUrl },
    )
    expect(result).toContain('https://example.com/img/photo.jpg')
  })

  test('preserves absolute links', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<a href="https://other.com">Other</a>' }),
      { baseUrl },
    )
    expect(result).toContain('[Other](https://other.com)')
  })

  test('unwraps hash-only links (keeps text, removes link)', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<a href="#section">Jump</a><p>Content</p>' }),
      { baseUrl },
    )
    expect(result).toContain('Jump')
    expect(result).not.toContain('[Jump]')
    expect(result).toContain('Content')
  })

  test('removes anchor elements with no href (id-only anchors)', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<a id="some-writing"></a><h1>Some writing</h1>' }),
      { baseUrl },
    )
    expect(result).not.toContain('[]')
    expect(result).toContain('Some writing')
  })

  test('resolves path-relative links', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<a href="sibling">Sibling</a>' }),
      { baseUrl },
    )
    expect(result).toContain('(https://example.com/docs/sibling)')
  })

  test('no-op without baseUrl', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<a href="/about">About</a>' }),
    )
    expect(result).toContain('(/about)')
  })
})

describe('strips empty elements', () => {
  test('strips empty paragraphs', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<p></p><p>Content</p>' }),
    )
    expect(result).toContain('Content')
    expect(result).toBe('Content\n')
  })

  test('strips whitespace-only paragraphs', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<p>   </p><p>Content</p>' }),
    )
    expect(result).toBe('Content\n')
  })

  test('strips empty headings', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<h2></h2><p>Content</p>' }),
    )
    expect(result).toBe('Content\n')
  })

  test('strips empty list items', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<ul><li></li><li>Item</li></ul>' }),
    )
    expect(result).toContain('Item')
    expect(result).not.toContain('* \n')
  })

  test('preserves non-empty elements', async () => {
    const { content: result } = await fromHtml(
      html({ body: '<p>Keep</p><div>Also keep</div>' }),
    )
    expect(result).toContain('Keep')
    expect(result).toContain('Also keep')
  })
})

describe('strips HTML comments', () => {
  test('strips React SSR hydration markers', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<!--$--><p>Content</p><!--/$--><!--$!--><!--/$-->',
      }),
    )
    expect(result).toBe('Content\n')
  })

  test('strips arbitrary comments', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<!--gEFrenCoRRJPVzAxJzheZ--><h1>Title<!-- --> here</h1>',
      }),
    )
    expect(result).toBe('# Title here\n')
  })
})

describe('pre newlines', () => {
  test('does not double newlines in syntax-highlighted code blocks', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<pre><code><span>line1</span>\n<span>line2</span>\n<span>line3</span></code></pre>',
      }),
    )
    expect(result).toContain('line1\nline2\nline3')
    expect(result).not.toContain('line1\n\nline2')
  })

  test('strips extra blank lines from pretty-printed div code blocks', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<pre><code>\n<div>line1</div>\n<div>line2</div>\n<div>line3</div>\n</code></pre>',
      }),
    )
    expect(result).toContain('line1\nline2\nline3')
    expect(result).not.toContain('line1\n\nline2')
  })

  test('strips trailing br inside div-per-line code blocks', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<pre><code><div class="cm-line"><span>line1</span><br/></div><div class="cm-line"><span>line2</span><br/></div><div class="cm-line"><span>line3</span><br/></div></code></pre>',
      }),
    )
    expect(result).toContain('line1\nline2\nline3')
    expect(result).not.toContain('line1\n\nline2')
  })
})

describe('strips form elements', () => {
  test('strips form elements', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<form><input type="text"><button>Submit</button></form><p>Content</p>',
      }),
    )
    expect(result).toContain('Content')
    expect(result).not.toContain('Submit')
  })

  test('strips elements with noise class names', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<div class="sidebar"><p>Side content</p></div><div class="ad-unit"><p>Buy now</p></div><p>Main content</p>',
      }),
    )
    const [main] = result.split('Sitemap:')
    expect(main).toContain('Main content')
    expect(main).not.toContain('Side content')
    expect(main).not.toContain('Buy now')
  })

  test('ignores noise tokens inside Tailwind utility classes', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<main class="flex md:[--fd-sidebar-width:268px] pe-(--fd-layout-offset)"><p>Content</p></main>',
      }),
    )
    expect(result).toContain('Content')
  })

  test('strips elements with noise id', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<div id="comments-section"><p>User comment</p></div><p>Article</p>',
      }),
    )
    const [main] = result.split('Sitemap:')
    expect(main).toContain('Article')
    expect(main).not.toContain('User comment')
  })

  test('strips hidden elements', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<div hidden><p>Hidden</p></div><div aria-hidden="true"><p>AriaHidden</p></div><div style="display:none"><p>DisplayNone</p></div><p>Visible</p>',
      }),
    )
    expect(result).toContain('Visible')
    expect(result).not.toContain('Hidden')
    expect(result).not.toContain('AriaHidden')
    expect(result).not.toContain('DisplayNone')
  })

  test('strips high link density blocks', async () => {
    const links = Array.from(
      { length: 10 },
      (_, i) => `<a href="/page${i}">Page ${i} link text</a>`,
    ).join(' ')
    const { content: result } = await fromHtml(
      html({
        body: `<div>${links}</div><p>Main content here</p>`,
      }),
    )
    const [main, related] = result.split('Sitemap:')
    expect(main).toContain('Main content')
    expect(main).not.toContain('Page 0')
    expect(related).toContain('[Page 0 link text](/page0)')
  })

  test('deduplicates related links', async () => {
    const { content: result } = await fromHtml(
      html({
        body: '<nav><a href="/home">Home</a></nav><footer><a href="/home">Home</a><a href="/about">About</a></footer><p>Content</p>',
      }),
    )
    const matches = result.match(/\[Home\]/g)
    expect(matches).toHaveLength(1)
  })

  test('preserves mark elements', async () => {
    const { content: result } = await fromHtml(
      '<p>This is <mark>highlighted</mark> text</p>',
    )
    expect(result).toContain('<mark>highlighted</mark>')
  })
})

function html(props: { body?: string; head?: string }) {
  return `<!doctype html><html><head>${props.head ?? ''}</head><body>${props.body ?? ''}</body></html>`
}
