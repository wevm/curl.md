import { expect, test } from 'vitest'

import { chunkMarkdown, filterSectionsByKeywords } from '#lib/chunk-markdown.ts'

test('returns single-element array for short content', () => {
  const result = chunkMarkdown('Hello world', 100)
  expect(result).toEqual(['Hello world'])
})

test('splits at h2 boundaries when content exceeds maxChars', () => {
  const md = `# Title\n\n${'a'.repeat(30)}\n\n## Section 2\n\n${'b'.repeat(30)}`
  const result = chunkMarkdown(md, 50)
  expect(result.length).toBeGreaterThan(1)
  expect(result[0]).toContain('a'.repeat(30))
  expect(result[result.length - 1]).toContain('## Section 2')
  for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(50)
})

test('splits at h3 boundaries when no h2 available', () => {
  const md = `${'a'.repeat(30)}\n\n### Sub 1\n\n${'b'.repeat(30)}`
  const result = chunkMarkdown(md, 50)
  expect(result.length).toBeGreaterThan(1)
  expect(result[0]).toContain('a'.repeat(30))
  expect(result[result.length - 1]).toContain('### Sub 1')
  for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(50)
})

test('splits at paragraph breaks when no headings available', () => {
  const md = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}`
  const result = chunkMarkdown(md, 50)
  expect(result.length).toBe(2)
  expect(result[0]).toBe('a'.repeat(30))
  expect(result[1]).toBe('b'.repeat(30))
  for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(50)
})

test('splits at single newlines as last resort', () => {
  const md = `${'a'.repeat(30)}\n${'b'.repeat(30)}`
  const result = chunkMarkdown(md, 50)
  expect(result.length).toBe(2)
  expect(result[0]).toBe('a'.repeat(30))
  expect(result[1]).toBe('b'.repeat(30))
  for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(50)
})

test('handles content with no natural break points', () => {
  const md = 'x'.repeat(150)
  const result = chunkMarkdown(md, 50)
  expect(result.length).toBe(3)
  expect(result.join('')).toBe(md)
  for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(50)
})

test('each chunk is <= maxChars', () => {
  const sections = Array.from(
    { length: 10 },
    (_, i) => `## Section ${i}\n\n${'word '.repeat(20)}`,
  )
  const md = sections.join('\n\n')
  const result = chunkMarkdown(md, 100)
  for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(100)
})

test('no content is lost when splitting', () => {
  const md = `${'a'.repeat(40)}\n\n${'b'.repeat(40)}\n\n${'c'.repeat(40)}`
  const result = chunkMarkdown(md, 50)
  const joined = result.join('\n\n')
  expect(joined).toContain('a'.repeat(40))
  expect(joined).toContain('b'.repeat(40))
  expect(joined).toContain('c'.repeat(40))
})

test('filterSectionsByKeywords matches substrings', () => {
  const md = [
    '## member\n\nThis is the member event.',
    '## membership\n\nThis is the membership event.',
    '## other\n\nUnrelated content.',
  ].join('\n')
  const result = filterSectionsByKeywords(md, ['member'])
  expect(result).toContain('## member')
  expect(result).toContain('## membership')
  expect(result).not.toContain('## other')
})
