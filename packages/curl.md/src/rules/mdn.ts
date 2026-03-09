import { defineRule } from '../mod.ts'

export const mdn = defineRule({
  key: 'mdn',
  patterns: [/^https:\/\/developer\.mozilla\.org\/[a-zA-Z-]+\/docs\/.+/],
  rewrite(url) {
    // biome-ignore lint/style/noNonNullAssertion: pattern guarantees match
    const [, locale, slug] = url.pathname.match(/^\/([a-zA-Z-]+)\/docs\/(.+)/)!
    const lowerLocale = locale.toLowerCase()
    const repo =
      lowerLocale === 'en-us' ? 'mdn/content' : 'mdn/translated-content'
    return new URL(
      `https://raw.githubusercontent.com/${repo}/main/files/${lowerLocale}/${slug.toLowerCase()}/index.md`,
    )
  },
  async extract(response) {
    let text = await response.text()

    // Extract title from frontmatter
    let title: string | undefined
    if (text.startsWith('---\n')) {
      const end = text.indexOf('\n---\n', 4)
      if (end !== -1) {
        const fm = text.slice(4, end)
        title = fm.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, '')
        text = text.slice(end + 5).replace(/^\n+/, '')
      }
    }

    // Strip block-level macros (Specifications, Compat, sidebar, etc.)
    text = text.replace(
      /^\{\{(Specifications|Compat|cssinfo|csssyntax|InheritanceDiagram|APIRef|DefaultAPISidebar|InteractiveExample|EmbedLiveSample|PreviousNext|Previous|Next|NextMenu|PreviousMenu)\b[^}]*\}\}\s*$/gm,
      '',
    )

    // Convert cross-reference macros to inline code
    // {{jsxref("Array/map", "map()")}} → `map()`
    // {{jsxref("Array")}} → `Array`
    text = text.replace(
      /\{\{(?:jsxref|cssxref|domxref|HTMLElement|SVGElement|SVGAttr|MathMLElement|CSSXref)\(["']([^"']+)["'](?:,\s*["']([^"']+)["'])?[^)]*\)\}\}/gi,
      (_, ref, display) => `\`${display ?? ref.split('/').pop()}\``,
    )

    // Convert HTTP macros to inline code
    text = text.replace(
      /\{\{(?:HTTPHeader|HTTPMethod|HTTPStatus|httpheader|httpmethod|httpstatus)\(["']([^"']+)["'](?:,\s*["']([^"']+)["'])?[^)]*\)\}\}/g,
      (_, ref, display) => `\`${display ?? ref}\``,
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
