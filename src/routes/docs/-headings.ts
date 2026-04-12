import type { Heading } from './-doc.types.ts'

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

    if (parseRenderedHeading(line)) outline.push({ type: 'rendered' })
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

    const heading = parseStepHeading(line)
    if (!heading) continue

    headings.push({
      heading: {
        id: getStepId(heading.title, stepSlugCounts),
        level: 3,
        text: `${stepNumber}. ${heading.title}`,
      },
      type: 'step',
    })
    stepNumber++
  }

  return headings
}

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

function parseRenderedHeading(line: string) {
  const match = /^(?: {0,3})(#{2,4})[ \t]+(.+?)\s*$/u.exec(line)
  if (!match) return

  const levelMarker = match[1]
  const rawTitle = match[2]?.trim()
  if (!levelMarker || !rawTitle) return

  const title = rawTitle.replace(/[ \t]+#+[ \t]*$/, '').trim()
  return title ? { level: levelMarker.length, title } : undefined
}

function parseStepHeading(line: string) {
  const match = /^(?: {0,3})#{2,6}[ \t]+(.+?)\s*$/u.exec(line)
  const rawTitle = match?.[1]?.trim()
  if (!rawTitle) return

  const title = rawTitle.replace(/[ \t]+#+[ \t]*$/, '').trim()
  return title ? { title } : undefined
}

function getCodeFenceMarker(line: string) {
  return /^(?: {0,3})(`{3,}|~{3,})/u.exec(line)?.[1]
}

function isMatchingFenceMarker(marker: string, other: string) {
  return marker[0] === other[0]
}

function getStepId(title: string, stepSlugCounts: Map<string, number>) {
  const baseSlug = slugifyHeading(title) || 'step'
  const count = stepSlugCounts.get(baseSlug) ?? 0
  stepSlugCounts.set(baseSlug, count + 1)
  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`
}

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`'".(),/#!?]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
