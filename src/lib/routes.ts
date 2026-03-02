const routes = ['', 'auth', 'check', 'login', 'playground'] as const

export type Route = (typeof routes)[number]

export const knownRoutes: Set<string> = new Set(routes)
