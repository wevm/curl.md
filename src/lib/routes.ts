const routes = ['', 'auth', 'check', 'invite', 'login', 'playground'] as const

export type Route = (typeof routes)[number]

export const knownRoutes: Set<string> = new Set(routes)

/** Whether a pathname should be routed to the API handler (external URL proxy). */
export function isApiPath(pathname: string): boolean {
  const firstSegment = pathname.split('/')[1] ?? ''
  return firstSegment.includes('.') || /^https?:$/.test(firstSegment)
}
