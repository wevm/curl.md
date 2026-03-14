export function filterSectionsByKeywords(markdown: string, keywords: string[]): string {
  const lower = keywords.map((k) => k.toLowerCase())
  const sections = splitBySeparator(markdown, /^###? /m, true)
  if (sections.length <= 1) return markdown

  const filtered = sections.filter((s) => {
    const lc = s.toLowerCase()
    return lower.some((k) => lc.includes(k))
  })
  return filtered.length > 0 ? filtered.join('') : markdown
}

export function chunkMarkdown(markdown: string, maxChars = 80_000): string[] {
  if (markdown.length <= maxChars) return [markdown]
  return splitAtBoundary(markdown, maxChars, 0)
}

const boundaryPatterns = [/^## /m, /^### /m, /\n\n/, /\n/]

function splitAtBoundary(text: string, maxChars: number, level: number): string[] {
  if (text.length <= maxChars) return [text]

  const pattern = boundaryPatterns[level]
  if (!pattern) {
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += maxChars) chunks.push(text.slice(i, i + maxChars))
    return chunks
  }

  const sections = splitBySeparator(text, pattern, level <= 1)
  if (sections.length <= 1) return splitAtBoundary(text, maxChars, level + 1)

  const chunks: string[] = []
  let current = ''
  for (const section of sections) {
    if (current && current.length + section.length > maxChars) {
      chunks.push(...splitAtBoundary(current, maxChars, level + 1))
      current = section
    } else {
      current += section
    }
  }
  if (current) chunks.push(...splitAtBoundary(current, maxChars, level + 1))
  return chunks
}

function splitBySeparator(text: string, pattern: RegExp, keepSeparator: boolean): string[] {
  if (keepSeparator) {
    const parts: string[] = []
    let remaining = text
    while (remaining) {
      const match = remaining.slice(1).search(pattern)
      if (match === -1) {
        parts.push(remaining)
        break
      }
      const index = match + 1
      parts.push(remaining.slice(0, index))
      remaining = remaining.slice(index)
    }
    return parts
  }

  const parts = text.split(pattern)
  return parts.filter((p) => p.length > 0)
}
