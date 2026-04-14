export type Config = {
  navbarLinks: Array<
    | { label: string; to: '/docs' | '/playground' }
    | {
        hash: string
        label: string
        params: { _splat: string }
        to: '/docs/$'
      }
  >
  repoBaseUrl: string
}

export const config = {
  navbarLinks: [
    { label: 'Guides', to: '/docs' as const },
    { label: 'API', to: '/playground' as const },
    {
      hash: 'cli',
      label: 'CLI',
      params: { _splat: 'getting_started/installation' },
      to: '/docs/$' as const,
    },
  ],
  repoBaseUrl: 'https://github.com/wevm/curl.md',
} satisfies Config
