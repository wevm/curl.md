import { expect, test } from 'vitest'
import { getDocSearchHighlightRanges } from './-search-highlight.ts'

test('search highlight ranges merge matches separated only by whitespace', () => {
  expect(getDocSearchHighlightRanges('Level 3 Heading', ['level', '3'])).toEqual([
    { end: 7, start: 0 },
  ])
})

test('search highlight ranges keep non-whitespace-separated matches distinct', () => {
  expect(getDocSearchHighlightRanges('Level-3 Heading', ['level', '3'])).toEqual([
    { end: 5, start: 0 },
    { end: 7, start: 6 },
  ])
})
