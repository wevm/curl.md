export type SearchPreviewCacheState = {
  ids: Set<string>
  key: string
}

export function getNextSearchPreviewCacheState(
  current: SearchPreviewCacheState,
  next: { cacheId?: string; key: string },
): SearchPreviewCacheState {
  if (current.key !== next.key)
    return {
      ids: next.cacheId ? new Set([next.cacheId]) : new Set(),
      key: next.key,
    }

  if (!next.cacheId || current.ids.has(next.cacheId)) return current

  const ids = new Set(current.ids)
  ids.add(next.cacheId)
  return { ids, key: current.key }
}
