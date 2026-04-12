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
  {
    type: 'group',
    label: 'Development',
    items: [
      { type: 'link', label: 'Contributing', path: '/development/contributing' },
      { type: 'link', label: 'Kitchen Sink', path: '/reference/kitchen_sink' },
    ],
  },
] satisfies Array<SidebarItem>

export type SidebarItem =
  | { type: 'link'; label: string; path: string }
  | { type: 'group'; label: string; items: Array<SidebarItem> }
