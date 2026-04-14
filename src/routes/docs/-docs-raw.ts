export function getRawDocSource(rawSource: unknown) {
  if (typeof rawSource === 'string') return rawSource
  if (
    rawSource &&
    typeof rawSource === 'object' &&
    'default' in rawSource &&
    typeof rawSource.default === 'string'
  )
    return rawSource.default
  return ''
}

export function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith('---\n')) return markdown
  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) return markdown
  return markdown.slice(end + 5).replace(/^\n+/, '')
}

export function collectDirectiveBody(lines: Array<string>, index: number) {
  const body: Array<string> = []
  let codeFenceMarker: string | undefined

  for (let endIndex = index + 1; endIndex < lines.length; endIndex++) {
    const line = lines[endIndex]!
    const fenceMarker = getCodeFenceMarker(line)

    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      body.push(line)
      continue
    }

    if (!codeFenceMarker && /^:::\s*$/u.test(line)) return { body, endIndex }
    body.push(line)
  }
}

export function parseMarkdownHeading(
  line: string,
  options?: { maxLevel?: number; minLevel?: number },
) {
  const match = /^(?: {0,3})(#{1,6})[ \t]+(.+?)\s*$/u.exec(line)
  if (!match?.[1] || !match[2]) return

  const level = match[1].length
  if (options?.minLevel !== undefined && level < options.minLevel) return
  if (options?.maxLevel !== undefined && level > options.maxLevel) return

  const text = match[2].replace(/[ \t]+#+[ \t]*$/, '').trim()
  return text ? { level, text } : undefined
}

export function getCodeFenceMarker(line: string) {
  return /^(?: {0,3})(`{3,}|~{3,})/u.exec(line)?.[1]
}

export function isMatchingFenceMarker(marker: string, other: string) {
  return marker[0] === other[0]
}

export function trimBlankLines(lines: Array<string>) {
  let start = 0
  let end = lines.length

  while (start < end && !(lines[start] ?? '').trim()) start++
  while (end > start && !(lines[end - 1] ?? '').trim()) end--

  return lines.slice(start, end)
}
