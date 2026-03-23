import { z } from 'zod'
import { defineRule } from '../mod.ts'

export const mdn = defineRule({
  key: 'mdn',
  patterns: [
    new URLPattern({ hostname: 'developer.mozilla.org', pathname: '/:locale/docs/:path+' }),
  ],
  checks: [
    {
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
      title: 'Array.prototype.map()',
      contains: ['map('],
      notContains: ['{{'],
      minLength: 500,
    },
  ],
  rewrite(_url, match) {
    const locale = match.pathname.groups.locale?.toLowerCase()
    const repo = locale === 'en-us' ? 'mdn/content' : 'mdn/translated-content'
    return new URL(
      `https://raw.githubusercontent.com/${repo}/main/files/${locale}/${match.pathname.groups.path!.toLowerCase()}/index.md`,
    )
  },
  async extract(response) {
    let text = await response.text()

    // Extract title and browser-compat query from frontmatter
    let title: string | undefined
    let bcdQueries: string[] = []
    let specUrls: string[] = []
    if (text.startsWith('---\n')) {
      const end = text.indexOf('\n---\n', 4)
      if (end !== -1) {
        const fm = text.slice(4, end)
        title = fm.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '')
        bcdQueries = parseYamlList(fm, 'browser-compat')
        specUrls = parseYamlList(fm, 'spec-urls')
        text = text.slice(end + 5).replace(/^\n+/, '')
      }
    }

    // Fetch BCD data for compat table and spec URL fallback
    const bcdResults = await Promise.all(bcdQueries.map(fetchBcd))
    const bcds = bcdResults.filter((b): b is BcdResult => b !== undefined)
    if (bcds.length > 0 && /^\{\{Compat\}\}\s*$/m.test(text)) {
      text = text.replace(/^\{\{Compat\}\}\s*$/m, bcds.map((b) => b.compatTable).join('\n'))
    }
    if (specUrls.length === 0) specUrls = bcds.flatMap((b) => b.specUrls)

    // Resolve {{Specifications}} to a spec table
    if (specUrls.length > 0 && /^\{\{Specifications\}\}\s*$/m.test(text)) {
      const rows = specUrls.map((url) => `| ${url} |`)
      text = text.replace(
        /^\{\{Specifications\}\}\s*$/m,
        `| Specification |\n|---|\n${rows.join('\n')}\n\n`,
      )
    }

    // Strip block-level macros (Specifications, Compat, sidebar, etc.)
    text = text.replace(
      /^\{\{(Specifications|Compat|cssinfo|csssyntax|InheritanceDiagram|APIRef|DefaultAPISidebar|InteractiveExample|EmbedLiveSample|PreviousNext|Previous|Next|NextMenu|PreviousMenu)\b[^}]*\}\}\s*$/gm,
      '',
    )

    // Convert cross-reference macros to linked inline code
    // {{jsxref("Array/map", "map()")}} → [`map()`](/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
    // {{jsxref("Array")}} → [`Array`](/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)
    text = text.replace(
      /\{\{(?:jsxref|cssxref|domxref|HTMLElement|SVGElement|SVGAttr|MathMLElement|CSSXref)\(["']([^"']+)["'](?:,\s*["']([^"']+)["'])?[^)]*\)\}\}/gi,
      (_, ref: string, display: string | undefined) => {
        const label = display ?? ref.split('/').pop()!
        const path = xrefPath(ref, _)
        if (!path) return `\`${label}\``
        return `[\`${label}\`](${path})`
      },
    )

    // Convert HTTP macros to linked inline code
    text = text.replace(
      /\{\{(?:HTTPHeader|HTTPMethod|HTTPStatus|httpheader|httpmethod|httpstatus)\(["']([^"']+)["'](?:,\s*["']([^"']+)["'])?[^)]*\)\}\}/gi,
      (_, ref: string, display: string | undefined) => {
        const label = display ?? ref
        const type = _.match(/\{\{(\w+)/)?.[1]?.replace(/^http/i, 'HTTP')
        const section = type?.startsWith('HTTPHeader')
          ? 'Headers'
          : type?.startsWith('HTTPMethod')
            ? 'Methods'
            : type?.startsWith('HTTPStatus')
              ? 'Status'
              : undefined
        if (!section) return `\`${label}\``
        return `[\`${label}\`](/en-US/docs/Web/HTTP/${section}/${ref})`
      },
    )

    // Convert Glossary macros to plain text
    text = text.replace(
      /\{\{Glossary\(["']([^"']+)["'](?:,\s*["']([^"']+)["'])?[^)]*\)\}\}/gi,
      (_, _ref, display) => display ?? _ref.replace(/_/g, ' '),
    )

    // Convert inline status macros to text
    text = text.replace(/\{\{optional_inline\}\}/gi, '_(optional)_')
    text = text.replace(/\{\{ReadOnlyInline\}\}/gi, '_(read-only)_')
    text = text.replace(/\{\{Experimental_Inline\}\}/gi, '_(experimental)_')
    text = text.replace(/\{\{Deprecated_Inline\}\}/gi, '_(deprecated)_')
    text = text.replace(/\{\{Non-standard_Inline\}\}/gi, '_(non-standard)_')

    // Strip any remaining macros
    text = text.replace(/\{\{[^}]+\}\}/g, '')

    // Convert MDN definition lists (- term\n  - : desc) to plain list items
    text = text.replace(/^(-\s+.+)\n\s+-\s+:\s+/gm, '$1 — ')

    // Clean code block info strings (remove example-good, hidden, interactive-example, etc.)
    text = text.replace(
      /^(```\w[\w-]*)(?:\s+(?:example-good|example-bad|hidden|interactive-example(?:-choice)?|live-sample___\S+|-nolint))+\s*$/gm,
      '$1',
    )
    // Handle -nolint suffix on language (e.g. js-nolint → js)
    text = text.replace(/^```(\w+)-nolint\s*$/gm, '```$1')

    // Collapse excessive blank lines
    text = text.replace(/\n{3,}/g, '\n\n')

    return {
      content: text.trim(),
      meta: {
        ...(title && { title }),
      },
    }
  },
})

const xrefBases: Record<string, string> = {
  jsxref: '/en-US/docs/Web/JavaScript/Reference/Global_Objects/',
  cssxref: '/en-US/docs/Web/CSS/',
  domxref: '/en-US/docs/Web/API/',
  htmlelement: '/en-US/docs/Web/HTML/Element/',
  svgelement: '/en-US/docs/Web/SVG/Element/',
  svgattr: '/en-US/docs/Web/SVG/Attribute/',
  mathmlelement: '/en-US/docs/Web/MathML/Element/',
}

function parseYamlList(fm: string, key: string): string[] {
  const inline = fm.match(new RegExp(`^${key}:[^\\S\\n]*(.+)$`, 'm'))
  if (inline) return [inline[1]!.trim()]
  const block = fm.match(new RegExp(`^${key}:[^\\S\\n]*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm'))
  if (!block) return []
  return [...block[1]!.matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1]!.trim())
}

const bcdBrowsers = [
  { key: 'chrome', label: 'Chrome' },
  { key: 'edge', label: 'Edge' },
  { key: 'firefox', label: 'Firefox' },
  { key: 'safari', label: 'Safari' },
  { key: 'chrome_android', label: 'Chrome Android' },
  { key: 'safari_ios', label: 'Safari iOS' },
] as const

const bcdMirrors: Record<string, string> = {
  edge: 'chrome',
  chrome_android: 'chrome',
  safari_ios: 'safari',
}

const bcdSupportEntry = z.object({
  version_added: z.union([z.string(), z.boolean(), z.null()]).optional(),
  version_removed: z.union([z.string(), z.null()]).optional(),
})

const bcdCompat = z.object({
  spec_url: z.union([z.string(), z.array(z.string())]).optional(),
  support: z.record(
    z.string(),
    z.union([bcdSupportEntry, z.array(bcdSupportEntry), z.literal('mirror')]),
  ),
})

type BcdResult = { compatTable: string; specUrls: string[] }

async function fetchBcd(query: string): Promise<BcdResult | undefined> {
  try {
    const segments = query.split('.')
    const depth = segments[0] === 'api' ? 2 : 3
    const filePath = segments.slice(0, depth).join('/')
    const base = 'https://raw.githubusercontent.com/mdn/browser-compat-data/main'
    let res = await fetch(`${base}/${filePath}.json`)
    // Some global APIs (e.g. api.fetch) live under api/_globals/
    if (!res.ok && segments[0] === 'api' && depth === 2)
      res = await fetch(`${base}/api/_globals/${segments[1]}.json`)
    if (!res.ok) return undefined
    const json = (await res.json()) as Record<string, unknown>

    const node = segments.reduce<Record<string, unknown> | undefined>(
      (obj, key) => (obj?.[key] as Record<string, unknown>) ?? undefined,
      json,
    )
    if (!node) return undefined

    // Collect features: top-level + sub-features
    const features: { name: string; support: z.output<typeof bcdCompat>['support'] }[] = []
    const topName = segments.at(-1)!
    const topParsed = z.safeParse(bcdCompat, node.__compat)
    let specUrls: string[] = []
    if (topParsed.success) {
      features.push({ name: topName, support: topParsed.data.support })
      const url = topParsed.data.spec_url
      specUrls = url ? (Array.isArray(url) ? url : [url]) : []
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === '__compat' || typeof value !== 'object' || !value) continue
      const sub = value as Record<string, unknown>
      const parsed = z.safeParse(bcdCompat, sub.__compat)
      if (parsed.success) features.push({ name: key, support: parsed.data.support })
    }
    if (features.length === 0) return undefined

    const header = `| | ${bcdBrowsers.map((b) => b.label).join(' | ')} |`
    const sep = `|---|${bcdBrowsers.map(() => '---').join('|')}|`
    const rows = features.map((f) => {
      const cells = bcdBrowsers.map((b) => {
        let entry = f.support[b.key]
        if (entry === 'mirror') entry = f.support[bcdMirrors[b.key] ?? '']
        const s = Array.isArray(entry) ? entry[0] : entry
        if (!s || typeof s === 'string') return '?'
        if (s.version_removed) return `${s.version_added}–${s.version_removed}`
        if (s.version_added === true) return 'Yes'
        if (s.version_added === false || s.version_added === null) return 'No'
        return String(s.version_added)
      })
      return `| ${f.name} | ${cells.join(' | ')} |`
    })

    return { compatTable: `${header}\n${sep}\n${rows.join('\n')}\n\n`, specUrls }
  } catch {
    return undefined
  }
}

function xrefPath(ref: string, fullMatch: string): string | undefined {
  const macroName = fullMatch.match(/\{\{(\w+)/)?.[1]?.toLowerCase()
  if (!macroName) return undefined
  const base = xrefBases[macroName]
  if (!base) return undefined
  // Normalize: strip trailing "()", replace dots with slashes for jsxref
  let slug = ref.replace(/\(\)$/, '')
  if (macroName === 'jsxref') slug = slug.replace(/\./g, '/').replace(/\/prototype\//gi, '/')
  return `${base}${slug}`
}
