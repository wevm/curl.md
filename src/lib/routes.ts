const routes = ['', 'auth', 'credits', 'invite', 'login', 'playground'] as const
export const knownRoutes: Set<string> = new Set(routes)

export function isApiPath(pathname: string): boolean {
  const firstSegment = pathname.split('/')[1] ?? ''
  return firstSegment.includes('.') || /^https?:$/.test(firstSegment)
}
