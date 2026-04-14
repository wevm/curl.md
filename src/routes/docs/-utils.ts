import type { ComponentType } from 'react'

export type Heading = { id: string; level: number; text: string }

export type Doc = {
  Component: ComponentType<{ components?: Record<string, ComponentType> }>
  description: string | undefined
  headings: Array<Heading>
  lastUpdated?: string
  path: string
  source: string
  sourcePath: string
  title: string
}

export type DocPagination = {
  next: Pick<Doc, 'path' | 'title'> | undefined
  previous: Pick<Doc, 'path' | 'title'> | undefined
}

export const docSearchHighlightClassName = 'bg-amber7 text-black'

const docSearchHighlightStopwords = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function getRawDocSource(rawSource: unknown) {
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

function stripFrontmatter(markdown: string) {
  if (!markdown.startsWith('---\n')) return markdown
  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) return markdown
  return markdown.slice(end + 5).replace(/^\n+/, '')
}

function collectDirectiveBody(lines: Array<string>, index: number) {
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

export function createDocCopySource(rawSource: unknown) {
  const lines = stripFrontmatter(getRawDocSource(rawSource)).split('\n')
  const output: Array<string> = []
  let codeFenceMarker: string | undefined

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fenceMarker = getCodeFenceMarker(line)

    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      output.push(line)
      continue
    }

    if (codeFenceMarker) {
      output.push(line)
      continue
    }

    if (/^import\s.+$/u.test(line)) continue

    const codeGroup = rewriteCodeGroupDirective(lines, index)
    if (codeGroup) {
      output.push(...codeGroup.lines)
      index = codeGroup.endIndex
      continue
    }

    const steps = rewriteStepsDirective(lines, index)
    if (steps) {
      output.push(...steps.lines)
      index = steps.endIndex
      continue
    }

    const notice = rewriteNoticeDirective(lines, index)
    if (notice) {
      output.push(...notice.lines)
      index = notice.endIndex
      continue
    }

    output.push(line)
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getDocHeadings(rawSource: unknown, renderedHeadings: Array<Heading>) {
  const sourceOutline = getSourceOutline(rawSource)
  const renderedHeadingCount = sourceOutline.filter((entry) => entry.type === 'rendered').length
  if (renderedHeadingCount !== renderedHeadings.length) return renderedHeadings

  const headings: Array<Heading> = []
  let renderedHeadingIndex = 0

  for (const entry of sourceOutline) {
    if (entry.type === 'rendered') {
      const heading = renderedHeadings[renderedHeadingIndex]
      if (heading) headings.push(heading)
      renderedHeadingIndex++
      continue
    }

    headings.push(entry.heading)
  }

  return headings
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
      (start <= previousRange.end ||
        isDocSearchHighlightJoiner(value.slice(previousRange.end, start)))
    ) {
      previousRange.end = end
      continue
    }

    ranges.push({ end, start })
  }

  return ranges
}

export function getStepId(title: string, stepSlugCounts: Map<string, number>) {
  const baseSlug = slugifyHeading(title) || 'step'
  const count = stepSlugCounts.get(baseSlug) ?? 0
  stepSlugCounts.set(baseSlug, count + 1)
  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`
}

function getSourceOutline(rawSource: unknown) {
  const lines = stripFrontmatter(getRawDocSource(rawSource)).split('\n')
  const outline: Array<{ type: 'rendered' } | { heading: Heading; type: 'step' }> = []
  let codeFenceMarker: string | undefined

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fenceMarker = getCodeFenceMarker(line)

    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      continue
    }

    if (codeFenceMarker) continue

    const stepHeadings = getStepHeadings(lines, index)
    if (stepHeadings) {
      outline.push(...stepHeadings)
      const body = collectDirectiveBody(lines, index)
      if (body) index = body.endIndex
      continue
    }

    if (parseMarkdownHeading(line, { maxLevel: 4, minLevel: 2 })) outline.push({ type: 'rendered' })
  }

  return outline
}

function getStepHeadings(lines: Array<string>, index: number) {
  if (!/^:::\s*steps\s*$/iu.test(lines[index]!)) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return []

  const stepSlugCounts = new Map<string, number>()
  const headings: Array<{ heading: Heading; type: 'step' }> = []
  let codeFenceMarker: string | undefined
  let stepNumber = 1

  for (const line of body.body) {
    const fenceMarker = getCodeFenceMarker(line)

    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      continue
    }

    if (codeFenceMarker) continue

    const heading = parseMarkdownHeading(line, { maxLevel: 6, minLevel: 2 })
    if (!heading) continue

    headings.push({
      heading: {
        id: getStepId(heading.text, stepSlugCounts),
        level: 3,
        text: `${stepNumber}. ${heading.text}`,
      },
      type: 'step',
    })
    stepNumber++
  }

  return headings
}

function createDocSearchHighlightRegExp(terms: Array<string> | undefined) {
  const normalizedTerms = normalizeDocSearchHighlightTerms(terms)
  if (!normalizedTerms.length) return undefined

  return new RegExp(`(${normalizedTerms.map((term) => escapeRegExp(term)).join('|')})`, 'giu')
}

export function normalizeDocSearchHighlightTerms(terms: Array<string> | undefined) {
  return [...new Set((terms ?? []).map((term) => term.trim()).filter(Boolean))]
    .filter((term) => !docSearchHighlightStopwords.has(term.toLowerCase()))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isDocSearchHighlightJoiner(value: string) {
  return /^[\s_]*$/u.test(value)
}

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`'".(),/#!?]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const noticeTypeMap = new Map([
  ['caution', 'CAUTION'],
  ['danger', 'CAUTION'],
  ['hint', 'TIP'],
  ['important', 'IMPORTANT'],
  ['note', 'NOTE'],
  ['tip', 'TIP'],
  ['warning', 'WARNING'],
])

function rewriteNoticeDirective(lines: Array<string>, index: number) {
  const directive = /^:::\s*([a-z]+)(?:\s+(.*?))?\s*$/u.exec(lines[index]!)
  const type = directive?.[1] ? noticeTypeMap.get(directive[1].toLowerCase()) : undefined
  if (!type) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return

  const trimmedBody = trimBlankLines(body.body)
  const output = [`> [!${type}]`]
  const title = directive?.[2]?.trim()

  if (title) {
    output.push(`> ${title}`)
    if (trimmedBody.length > 0) output.push('>')
  }

  for (const line of trimmedBody) output.push(line ? `> ${line}` : '>')

  return {
    endIndex: body.endIndex,
    lines: output,
  }
}

function rewriteCodeGroupDirective(lines: Array<string>, index: number) {
  if (!/^:::\s*codegroup\s*$/iu.test(lines[index]!)) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return

  const rewrittenBody = rewriteCodeGroupItems(body.body)
  if (!rewrittenBody) return

  return {
    endIndex: body.endIndex,
    lines: rewrittenBody,
  }
}

function rewriteStepsDirective(lines: Array<string>, index: number) {
  if (!/^:::\s*steps\s*$/iu.test(lines[index]!)) return

  const body = collectDirectiveBody(lines, index)
  if (!body) return

  const rewrittenBody = rewriteStepsItems(body.body)
  if (!rewrittenBody) return

  return {
    endIndex: body.endIndex,
    lines: rewrittenBody,
  }
}

function rewriteCodeGroupItems(lines: Array<string>) {
  const rewritten: Array<string> = []
  let itemCount = 0

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]!
    if (!line.trim()) {
      index++
      continue
    }

    const item = rewriteCodeGroupItem(lines, index)
    if (!item) return

    if (rewritten.length > 0) rewritten.push('')
    rewritten.push(...item.lines)
    index = item.endIndex + 1
    itemCount++
  }

  return itemCount > 0 ? rewritten : undefined
}

function rewriteCodeGroupItem(lines: Array<string>, index: number) {
  const fence = /^(?: {0,3})(`{3,}|~{3,})(.*)$/u.exec(lines[index]!)
  if (!fence) return

  const marker = fence[1]!
  const { info, label } = splitCodeGroupFenceInfo(fence[2] ?? '')
  const rewritten = [getCodeFenceLine(marker, info, label)]

  for (let endIndex = index + 1; endIndex < lines.length; endIndex++) {
    const line = lines[endIndex]!
    rewritten.push(line)
    if (!isClosingCodeFence(line, marker)) continue
    return { endIndex, lines: rewritten }
  }
}

function rewriteStepsItems(lines: Array<string>) {
  const rewritten: Array<string> = []
  let itemCount = 0

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]!
    if (!line.trim()) {
      index++
      continue
    }

    const item = rewriteStepsItem(lines, index, itemCount + 1)
    if (!item) return

    if (rewritten.length > 0) rewritten.push('')
    rewritten.push(...item.lines)
    index = item.endIndex + 1
    itemCount++
  }

  return itemCount > 0 ? rewritten : undefined
}

function rewriteStepsItem(lines: Array<string>, index: number, stepNumber: number) {
  const line = lines[index]
  if (!line) return

  const heading = parseMarkdownHeading(line, { maxLevel: 6, minLevel: 2 })
  if (!heading) return

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

    if (!codeFenceMarker && parseMarkdownHeading(line, { maxLevel: 6, minLevel: 2 }))
      return createStepItemRewrite(heading.text, trimBlankLines(body), endIndex - 1, stepNumber)

    body.push(line)
  }

  return createStepItemRewrite(heading.text, trimBlankLines(body), lines.length - 1, stepNumber)
}

function splitCodeGroupFenceInfo(info: string) {
  const trimmed = info.trim()
  if (!trimmed) return { info: '', label: undefined }

  const match = /^(.*?)(?:\s+\[([^\]]+)\])?$/u.exec(trimmed)
  return {
    info: match?.[1]?.trim() ?? trimmed,
    label: match?.[2]?.trim() || undefined,
  }
}

function isClosingCodeFence(line: string, marker: string) {
  const fenceMarker = /^(?: {0,3})(`{3,}|~{3,})\s*$/u.exec(line)?.[1]
  return fenceMarker
    ? isMatchingFenceMarker(fenceMarker, marker) && fenceMarker.length >= marker.length
    : false
}

function getCodeFenceLine(marker: string, info: string, label: string | undefined) {
  if (!info && !label) return marker
  if (!label) return `${marker}${info}`
  return info
    ? `${marker}${info} title=${JSON.stringify(label)}`
    : `${marker} title=${JSON.stringify(label)}`
}

function createStepItemRewrite(
  title: string,
  body: Array<string>,
  endIndex: number,
  stepNumber: number,
) {
  const lines = [`${stepNumber}. ${title}`]

  if (body.length > 0) {
    lines.push('')
    lines.push(...body.map((line) => (line ? `   ${line}` : '')))
  }

  return {
    endIndex,
    lines,
  }
}
