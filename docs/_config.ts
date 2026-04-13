export const navbarLinks = [
  { label: 'Guides', to: '/docs' as const },
  { label: 'API', to: '/playground' as const },
  {
    hash: 'cli',
    label: 'CLI',
    params: { _splat: 'getting_started/installation' },
    to: '/docs/$' as const,
  },
] satisfies Array<NavbarLink>

export type NavbarLink =
  | { label: string; to: '/docs' | '/playground' }
  | {
      hash: string
      label: string
      params: { _splat: string }
      to: '/docs/$'
    }
