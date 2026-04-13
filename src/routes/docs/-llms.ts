export type DocsLlmsSection = {
  docs: Array<{ description: string | undefined; path: string; title: string }>
  title: string
}

export type DocsLlmsFullDoc = {
  description: string | undefined
  path: string
  source: string
  title: string
}

export function generateDocsLlmsTxt(props: { sections: Array<DocsLlmsSection> }) {
  const { sections } = props
  const lines = [
    '# curl.md Docs',
    '',
    '> Canonical curl.md documentation for installation, usage, and development.',
    '',
    'Use these pages when you need the current published docs. The links below follow the docs navigation order.',
  ]

  for (const section of sections) {
    lines.push('', `## ${section.title}`, '')

    for (const doc of section.docs)
      lines.push(
        `- [${doc.title}](${doc.path ? `/docs/${doc.path}.md` : '/docs/index.md'}): ${doc.description ?? doc.title}`,
      )
  }

  return `${lines.join('\n')}\n`
}

export function generateDocsLlmsFullTxt(props: { docs: Array<DocsLlmsFullDoc> }) {
  const { docs } = props
  const lines = [
    '# curl.md Docs Full',
    '',
    '> Full markdown export of the canonical curl.md documentation.',
    '',
    'Use this file when you want the entire docs set in a single markdown document.',
  ]

  for (const doc of docs) {
    lines.push('', `## ${doc.path ? `/docs/${doc.path}.md` : '/docs/index.md'}`, '')

    if (doc.description) lines.push(doc.description, '')

    lines.push(doc.source)
  }

  return `${lines.join('\n')}\n`
}
