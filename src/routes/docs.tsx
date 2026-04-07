import { createFileRoute } from '@tanstack/react-router'
import { docsHead, DocsPage, getDocPage } from './-docs.tsx'

function Component() {
  return <DocsPage />
}

export const Route = createFileRoute('/docs')({
  beforeLoad() {
    getDocPage()
  },
  head: () => docsHead({}),
  component: Component,
})
