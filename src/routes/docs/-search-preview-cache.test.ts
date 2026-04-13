import { expect, test } from 'vitest'
import { getNextSearchPreviewCacheState } from './-search-preview-cache.ts'

test('preview cache adds ids while the search scope stays the same', () => {
  const initialState = { ids: new Set<string>(), key: 'install::a|b' }

  const nextState = getNextSearchPreviewCacheState(initialState, {
    cacheId: 'a',
    key: 'install::a|b',
  })

  expect([...nextState.ids]).toEqual(['a'])

  const finalState = getNextSearchPreviewCacheState(nextState, {
    cacheId: 'b',
    key: 'install::a|b',
  })

  expect([...finalState.ids]).toEqual(['a', 'b'])
})

test('preview cache resets when the search scope changes', () => {
  const initialState = { ids: new Set(['a']), key: 'install::a|b' }

  const nextState = getNextSearchPreviewCacheState(initialState, {
    key: 'auth::c|d',
  })

  expect([...nextState.ids]).toEqual([])
  expect(nextState.key).toBe('auth::c|d')
})
