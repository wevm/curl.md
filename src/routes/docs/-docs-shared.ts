import type { ComponentType } from 'react'
import {
  collectDirectiveBody,
  getCodeFenceMarker,
  getRawDocSource,
  isMatchingFenceMarker,
  parseMarkdownHeading,
  stripFrontmatter,
} from './-docs-raw.ts'

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

export const docSearchHighlightClassName = 'docs-search-highlight'

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
