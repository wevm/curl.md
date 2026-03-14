import { describe, expect, test } from 'vitest'
import { chunkMarkdown, filterSectionsByKeywords } from '#md/chunk.ts'

describe('filterSectionsByKeywords', () => {
  test('returns full text when no headings exist', () => {
    const md = 'Just a paragraph with no headings.'
    expect(filterSectionsByKeywords(md, ['paragraph'])).toBe(md)
  })

  test('filters h2 sections by keyword', () => {
    const md = '## Apples\nRed fruit\n## Bananas\nYellow fruit\n## Carrots\nOrange veggie'
    const result = filterSectionsByKeywords(md, ['banana'])
    expect(result).toContain('## Bananas')
    expect(result).toContain('Yellow fruit')
    expect(result).not.toContain('## Apples')
    expect(result).not.toContain('## Carrots')
  })

  test('filters sections matching keyword in body', () => {
    const md = '## First\nAlpha content\n## Second\nBeta content'
    const result = filterSectionsByKeywords(md, ['beta'])
    expect(result).toContain('Beta content')
    expect(result).not.toContain('Alpha content')
  })

  test('is case-insensitive', () => {
    const md = '## Hello\nWorld\n## Goodbye\nMoon'
    const result = filterSectionsByKeywords(md, ['HELLO'])
    expect(result).toContain('## Hello')
    expect(result).not.toContain('## Goodbye')
  })

  test('returns full text when no sections match', () => {
    const md = '## Apples\nFruit\n## Bananas\nFruit'
    expect(filterSectionsByKeywords(md, ['zebra'])).toBe(md)
  })

  test('matches multiple keywords', () => {
    const md = '## Apples\nRed\n## Bananas\nYellow\n## Carrots\nOrange'
    const result = filterSectionsByKeywords(md, ['apple', 'carrot'])
    expect(result).toContain('## Apples')
    expect(result).toContain('## Carrots')
    expect(result).not.toContain('## Bananas')
  })
})

describe('chunkMarkdown', () => {
  test('returns single chunk when under limit', () => {
    const md = 'Short content'
    expect(chunkMarkdown(md, 100)).toEqual(['Short content'])
  })

  test('splits on h2 boundaries', () => {
    const md = '## Alpha\nShort A\n## Beta\nShort B'
    const chunks = chunkMarkdown(md, 20)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.some((c) => c.includes('## Alpha'))).toBe(true)
    expect(chunks.some((c) => c.includes('## Beta'))).toBe(true)
  })

  test('splits on h3 boundaries when h2 not available', () => {
    const md = 'Intro text\n### Part 1\nShort X\n### Part 2\nShort Y'
    const chunks = chunkMarkdown(md, 25)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.some((c) => c.includes('### Part 1'))).toBe(true)
    expect(chunks.some((c) => c.includes('### Part 2'))).toBe(true)
  })

  test('splits on double newlines as fallback', () => {
    const md = 'Paragraph one.\n\nParagraph two.'
    const chunks = chunkMarkdown(md, 16)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.some((c) => c.includes('Paragraph one'))).toBe(true)
    expect(chunks.some((c) => c.includes('Paragraph two'))).toBe(true)
  })

  test('hard-splits when no boundaries found', () => {
    const md = 'x'.repeat(200)
    const chunks = chunkMarkdown(md, 80)
    expect(chunks.length).toBe(3)
    expect(chunks.join('')).toBe(md)
    expect(chunks[0]!.length).toBe(80)
    expect(chunks[1]!.length).toBe(80)
    expect(chunks[2]!.length).toBe(40)
  })

  test('splits large content into bounded chunks', () => {
    const sections = Array.from(
      { length: 10 },
      (_, i) => `## Section ${i}\n${'content '.repeat(100)}`,
    )
    const md = sections.join('\n')
    const chunks = chunkMarkdown(md, 500)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(500)
  })
})
