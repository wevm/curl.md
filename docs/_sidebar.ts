export const sidebar = [
  { type: 'link', label: 'Introduction', path: '/' },
  {
    type: 'group',
    label: 'Getting Started',
    items: [
      { type: 'link', label: 'Installation', path: '/getting_started/installation' },
      { type: 'link', label: 'Quick Start', path: '/getting_started/quick_start' },
    ],
  },
] satisfies Array<SidebarItem>

export type SidebarItem =
  | { type: 'link'; label: string; path: string }
  | { type: 'group'; label: string; items: Array<SidebarItem> }
