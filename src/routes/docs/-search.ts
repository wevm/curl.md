import MiniSearch from 'minisearch'
import {
  getCodeFenceMarker,
  isMatchingFenceMarker,
  normalizeDocSearchHighlightTerms,
  parseMarkdownHeading,
  trimBlankLines,
  type Heading,
} from './-utils.ts'

export type DocSearchResult =
  | {
      kind: 'page'
      path: string
      snippet?: string
      terms?: Array<string>
      title: string
    }
  | {
      hash: string
      kind: 'section'
      path: string
      sectionPath: Array<string>
      sectionTitle: string
      snippet?: string
      terms?: Array<string>
      title: string
    }

export function createDocsSearch(
  docs: Array<{
    description: string | undefined
    headings: Array<Heading>
    path: string
    source: string
    title: string
  }>,
  orderedPaths: Array<string>,
) {
  const docOrderByPath = new Map(orderedPaths.map((path, index) => [path, index]))
  const docsSearch = new MiniSearch<DocSearchDocument>({
    fields: ['body', 'description', 'sectionPathText', 'sectionTitle', 'title'],
    storeFields: [
      'description',
      'details',
      'hash',
      'kind',
      'order',
      'path',
      'sectionPath',
      'sectionTitle',
      'title',
    ],
  })

  docsSearch.addAll(
    docs.flatMap((doc) => {
      const searchSource = stripIgnoredDocSearchCodeGroupTabs(doc.source)
      const body = stripDocSearchMarkdown(searchSource)
      const description = doc.description ?? ''
      const headingPaths = getHeadingPaths(doc.headings)
      const sectionBodiesByHeadingId = getDocSearchSectionBodies(searchSource, doc.headings)
      const order = docOrderByPath.get(doc.path) ?? orderedPaths.length

      return [
        {
          body,
          details: body,
          description,
          hash: '',
          id: doc.path || 'index',
          kind: 'page' as const,
          order,
          path: doc.path,
          sectionPath: [],
          sectionPathText: '',
          sectionTitle: '',
          title: doc.title,
        },
        ...headingPaths.map(({ heading, path }) => {
          const sectionBody = sectionBodiesByHeadingId.get(heading.id) ?? ''
          const sectionText = stripDocSearchMarkdown(sectionBody)

          return {
            body: sectionText,
            details: sectionText,
            description,
            hash: heading.id,
            id: `${doc.path || 'index'}#${heading.id}`,
            kind: 'section' as const,
            order,
            path: doc.path,
            sectionPath: path,
            sectionPathText: path.join(' > '),
            sectionTitle: heading.text,
            title: doc.title,
          }
        }),
      ]
    }),
  )

  return {
    search(query: string): Array<DocSearchResult> {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) return []
      const normalizedQueryPhrase = collapseWhitespace(normalizedQuery)

      return docsSearch
        .search(normalizedQuery, {
          boost: { description: 3, sectionPathText: 7, sectionTitle: 6, title: 8 },
          fuzzy: (term) => (term.length >= 6 ? 0.34 : term.length >= 5 ? 0.2 : false),
          maxFuzzy: 2,
          prefix: true,
        })
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .slice(0, 8)
        .map((result) => {
          const searchableText = collapseWhitespace(
            [
              result.description,
              result.details,
              result.sectionPath?.join(' > '),
              result.sectionTitle,
              result.title,
            ]
              .filter(Boolean)
              .join('\n'),
          )
          const terms = normalizeDocSearchHighlightTerms([
            // Highlight the full phrase, including stopwords, when the result contains it verbatim.
            ...(searchableText.toLowerCase().includes(normalizedQueryPhrase.toLowerCase())
              ? [normalizedQueryPhrase]
              : []),
            // Keep punctuation-bearing tokens like md_ because MiniSearch drops them from term matches.
            ...normalizedQuery
              .split(/\s+/u)
              .map((term) => term.trim())
              .filter(Boolean)
              .filter((term) => /[^a-z0-9]/iu.test(term)),
            ...(result.terms ?? []),
          ])

          return {
            ...(result.hash ? { hash: result.hash } : {}),
            kind: result.kind,
            path: result.path,
            ...(result.sectionPath?.length ? { sectionPath: result.sectionPath } : {}),
            ...(result.sectionTitle ? { sectionTitle: result.sectionTitle } : {}),
            ...(result.details
              ? (() => {
                  const snippet = getDocSearchSnippet(
                    result.kind,
                    result.description,
                    result.details,
                    terms,
                  )
                  return snippet ? { snippet } : {}
                })()
              : {}),
            ...(terms.length ? { terms } : {}),
            title: result.title,
          }
        })
    },
  }
}

type DocSearchDocument = {
  body: string
  details: string
  description: string
  hash: string
  id: string
  kind: 'page' | 'section'
  order: number
  path: string
  sectionPath: Array<string>
  sectionPathText: string
  sectionTitle: string
  title: string
}

function getHeadingPaths(headings: Array<Heading>) {
  const stack: Array<{ level: number; text: string }> = []

  return headings.map((heading) => {
    while (stack.at(-1)?.level !== undefined && stack.at(-1)!.level >= heading.level) stack.pop()
    stack.push({ level: heading.level, text: heading.text })
    return { heading, path: stack.map((entry) => entry.text) }
  })
}

function getDocSearchSnippet(
  kind: DocSearchDocument['kind'],
  description: string,
  body: string,
  terms: Array<string>,
) {
  const normalizedDescription = collapseWhitespace(description)
  const normalizedBody = collapseWhitespace(body)

  if (kind === 'page') {
    if (normalizedDescription) return normalizedDescription
    if (!normalizedBody) return undefined
    return `${normalizedBody.slice(0, 140)}${normalizedBody.length > 140 ? '…' : ''}`
  }

  const bodySnippet = getDocSearchMatchSnippet(normalizedBody, terms)
  if (bodySnippet) return bodySnippet

  if (!normalizedBody) return undefined
  return normalizedBody.slice(0, 140)
}

function getDocSearchMatchSnippet(value: string, terms: Array<string>) {
  if (!value) return undefined

  const valueLower = value.toLowerCase()
  let matchIndex = Number.POSITIVE_INFINITY

  for (const term of terms) {
    const index = valueLower.indexOf(term.toLowerCase())
    if (index !== -1 && index < matchIndex) matchIndex = index
  }

  if (!Number.isFinite(matchIndex)) return undefined

  if (value.length <= 140) return value

  const start = Math.max(0, matchIndex - 48)
  const end = Math.min(value.length, matchIndex + 92)
  return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`
}

function getDocSearchSectionBodies(source: string, headings: Array<Heading>) {
  const lines = source.split('\n')
  const sourceSections = getDocSearchSourceSections(lines)
  const matchedSections: Array<{
    bodyStartLineIndex: number
    heading: Heading
    level: number
    startLineIndex: number
  }> = []
  let searchStartIndex = 0

  for (const heading of headings) {
    const normalizedHeadingText = normalizeDocSearchSectionText(heading.text)

    for (let index = searchStartIndex; index < sourceSections.length; index++) {
      const sourceSection = sourceSections[index]
      if (!sourceSection) continue
      if (sourceSection.level !== heading.level) continue
      if (normalizeDocSearchSectionText(sourceSection.text) !== normalizedHeadingText) continue

      matchedSections.push({
        bodyStartLineIndex: sourceSection.bodyStartLineIndex,
        heading,
        level: sourceSection.level,
        startLineIndex: sourceSection.startLineIndex,
      })
      searchStartIndex = index + 1
      break
    }
  }

  const sectionBodiesByHeadingId = new Map<string, string>()

  for (let index = 0; index < matchedSections.length; index++) {
    const currentSection = matchedSections[index]
    if (!currentSection) continue

    let endLineIndex = lines.length

    for (let nextIndex = index + 1; nextIndex < matchedSections.length; nextIndex++) {
      const nextSection = matchedSections[nextIndex]
      if (!nextSection) continue
      if (nextSection.level > currentSection.level) continue

      endLineIndex = nextSection.startLineIndex
      break
    }

    sectionBodiesByHeadingId.set(
      currentSection.heading.id,
      trimBlankLines(lines.slice(currentSection.bodyStartLineIndex, endLineIndex)).join('\n'),
    )
  }

  return sectionBodiesByHeadingId
}

function getDocSearchSourceSections(lines: Array<string>) {
  const sections: Array<{
    bodyStartLineIndex: number
    level: number
    startLineIndex: number
    text: string
  }> = []
  let codeFenceMarker: string | undefined

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const fenceMarker = getCodeFenceMarker(line)

    if (fenceMarker) {
      if (!codeFenceMarker) codeFenceMarker = fenceMarker
      else if (isMatchingFenceMarker(fenceMarker, codeFenceMarker)) codeFenceMarker = undefined
      continue
    }

    if (codeFenceMarker) continue

    const heading = parseMarkdownHeading(line, { maxLevel: 4, minLevel: 2 })
    if (heading) {
      sections.push({
        bodyStartLineIndex: index + 1,
        level: heading.level,
        startLineIndex: index,
        text: heading.text,
      })
      continue
    }

    // Step headings are emitted as ordered-list lines in the copied markdown source.
    const step = /^(?: {0,3})(\d+\.\s+.+?)\s*$/u.exec(line)?.[1]?.trim()
    if (!step) continue

    sections.push({
      bodyStartLineIndex: index + 1,
      level: 3,
      startLineIndex: index,
      text: step,
    })
  }

  return sections
}

function normalizeDocSearchSectionText(value: string) {
  return collapseWhitespace(stripDocSearchMarkdown(value))
}

function stripDocSearchMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/^```[^\n]*$/gmu, '')
    .replace(/^~~~[^\n]*$/gmu, '')
    .replace(/^>\s?/gmu, '')
    .replace(/^[-*+]\s+/gmu, '')
    .replace(/^\d+\.\s+/gmu, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripIgnoredDocSearchCodeGroupTabs(source: string) {
  const lines = source.split('\n')
  const output: Array<string> = []
  let skippedFenceMarker: string | undefined

  for (const line of lines) {
    const fenceMarker = getCodeFenceMarker(line)

    if (skippedFenceMarker) {
      if (fenceMarker && isMatchingFenceMarker(fenceMarker, skippedFenceMarker))
        skippedFenceMarker = undefined
      continue
    }

    if (isIgnoredDocSearchCodeGroupTabFence(line)) {
      skippedFenceMarker = fenceMarker
      continue
    }

    output.push(line)
  }

  return output.join('\n')
}

function isIgnoredDocSearchCodeGroupTabFence(line: string) {
  const title = /^(?: {0,3})(?:`{3,}|~{3,})[^\n]*\btitle=(['"])([^'"]+)\1/u.exec(line)?.[2]
  return title ? ignoredDocSearchCodeGroupTabLabels.has(title.trim().toLowerCase()) : false
}

const ignoredDocSearchCodeGroupTabLabels = new Set(['bun', 'npm', 'pnpm'])
