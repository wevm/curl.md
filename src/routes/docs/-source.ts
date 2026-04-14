import {
  collectDirectiveBody,
  getCodeFenceMarker,
  getRawDocSource,
  isMatchingFenceMarker,
  parseMarkdownHeading,
  stripFrontmatter,
  trimBlankLines,
} from './-docs-raw.ts'

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
