export const docSearchHighlightClassName = 'docs-search-highlight'

export function createDocSearchHighlightRegExp(terms: Array<string> | undefined) {
  const normalizedTerms = normalizeDocSearchHighlightTerms(terms)
  if (!normalizedTerms.length) return undefined

  return new RegExp(`(${normalizedTerms.map((term) => escapeRegExp(term)).join('|')})`, 'giu')
}

export function getDocSearchHighlightRanges(value: string, terms: Array<string> | undefined) {
  if (!value) return []

  const pattern = createDocSearchHighlightRegExp(terms)
  if (!pattern) return []

  const ranges: Array<{ end: number; start: number }> = []

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const previousRange = ranges.at(-1)

    if (
      previousRange &&
      (start <= previousRange.end || !value.slice(previousRange.end, start).trim())
    ) {
      previousRange.end = end
      continue
    }

    ranges.push({ end, start })
  }

  return ranges
}

function normalizeDocSearchHighlightTerms(terms: Array<string> | undefined) {
  return [...new Set((terms ?? []).map((term) => term.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
