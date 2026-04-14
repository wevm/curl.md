import { linkOptions } from '@tanstack/react-router'

export const config = {
  navbarLinks: [
    { label: 'Guides', ...linkOptions({ to: '/docs' }) },
    { label: 'API', ...linkOptions({ to: '/playground' }) },
    {
      label: 'CLI',
      ...linkOptions({
        hash: 'cli',
        params: { _splat: 'getting_started/installation' },
        to: '/docs/$',
      }),
    },
  ],
  repoBaseUrl: 'https://github.com/wevm/curl.md',
}

export type Config = typeof config
