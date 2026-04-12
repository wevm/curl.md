import { Tabs } from '@base-ui/react/tabs'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import IconOcticonAlert16 from '~icons/octicon/alert16.jsx'
import IconOcticonInfo16 from '~icons/octicon/info16.jsx'
import IconOcticonLightBulb16 from '~icons/octicon/light-bulb16.jsx'
import IconOcticonPencil16 from '~icons/octicon/pencil-16.jsx'
import IconOcticonReport16 from '~icons/octicon/report16.jsx'
import IconOcticonStop16 from '~icons/octicon/stop16.jsx'
import IconVscodeIconsFileTypeBun from '~icons/vscode-icons/file-type-bun.jsx'
import IconVscodeIconsFileTypeDeno from '~icons/vscode-icons/file-type-deno.jsx'
import IconVscodeIconsFileTypeJs from '~icons/vscode-icons/file-type-js.jsx'
import IconVscodeIconsFileTypeJson from '~icons/vscode-icons/file-type-json.jsx'
import IconVscodeIconsFileTypeMarkdown from '~icons/vscode-icons/file-type-markdown.jsx'
import IconVscodeIconsFileTypeNpm from '~icons/vscode-icons/file-type-npm.jsx'
import IconVscodeIconsFileTypePnpm from '~icons/vscode-icons/file-type-pnpm.jsx'
import IconVscodeIconsFileTypePowershell from '~icons/vscode-icons/file-type-powershell.jsx'
import IconVscodeIconsFileTypeShell from '~icons/vscode-icons/file-type-shell.jsx'
import IconVscodeIconsFileTypeTypescript from '~icons/vscode-icons/file-type-typescript.jsx'
import IconVscodeIconsFileTypeYaml from '~icons/vscode-icons/file-type-yaml.jsx'
import IconVscodeIconsFileTypeYarn from '~icons/vscode-icons/file-type-yarn.jsx'
import { useCopyToClipboard } from '#hooks/useCopyToClipboard.ts'
import type { Doc, DocPagination } from './-doc.types.ts'

export function DocContent(props: { doc: Doc; pagination?: DocPagination }) {
  const { doc, pagination = { next: undefined, previous: undefined } } = props
  const { copied, copy } = useCopyToClipboard({ content: doc.source })
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | undefined>(undefined)
  const hasHeadings = doc.headings.length > 0
  const editHref = `https://github.com/wevm/curl.md/edit/main/${doc.sourcePath}`
  const reportIssueHref = 'https://github.com/wevm/curl.md/issues/new/choose'

  React.useEffect(() => {
    if (!hasHeadings) {
      setActiveHeadingId(undefined)
      return
    }

    const fixedNavbarHeightPx = 68
    const thresholdOffsetPx = 24

    const syncActiveHeading = () => {
      const headings = doc.headings
        .map((heading) => ({ element: document.getElementById(heading.id), id: heading.id }))
        .filter(
          (heading): heading is { element: HTMLElement; id: string } => heading.element !== null,
        )
        .map((heading) => ({ ...heading, top: getAbsoluteTop(heading.element) }))
        .filter((heading) => !Number.isNaN(heading.top))
      if (!headings.length) return

      const hashHeadingId = headings.find(
        (heading) => heading.id === decodeURIComponent(window.location.hash.slice(1)),
      )?.id

      if (window.scrollY < 1 && !hashHeadingId) {
        setActiveHeadingId((current) => (current === undefined ? current : undefined))
        return
      }

      let nextActiveHeadingId: string | undefined = undefined

      for (const heading of headings) {
        if (heading.top <= window.scrollY + fixedNavbarHeightPx + thresholdOffsetPx)
          nextActiveHeadingId = heading.id
        else break
      }

      if (nextActiveHeadingId === undefined && hashHeadingId) nextActiveHeadingId = hashHeadingId

      setActiveHeadingId((current) =>
        current === nextActiveHeadingId ? current : nextActiveHeadingId,
      )
    }

    let frameId: number | undefined

    const onScroll = () => {
      if (frameId !== undefined) return
      frameId = window.requestAnimationFrame(() => {
        frameId = undefined
        syncActiveHeading()
      })
    }

    requestAnimationFrame(syncActiveHeading)
    window.addEventListener('hashchange', syncActiveHeading)
    window.addEventListener('resize', syncActiveHeading)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId)
      window.removeEventListener('hashchange', syncActiveHeading)
      window.removeEventListener('resize', syncActiveHeading)
      window.removeEventListener('scroll', onScroll)
    }
  }, [doc.path, doc.headings, hasHeadings])

  return (
    <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 lg:grid-cols-[minmax(0,56rem)_16rem] lg:gap-12">
      <article className="min-w-0 px-8 py-8 md:px-12 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-0">
        <doc.Component components={mdxComponents} />

        {(pagination.previous || pagination.next) && (
          <nav className="border-gray-a3 mt-12 grid gap-4 border-t pt-6 sm:grid-cols-2">
            {pagination.previous ? (
              <DocPaginationLink direction="previous" doc={pagination.previous} />
            ) : (
              <div className="hidden sm:block" />
            )}
            {pagination.next && <DocPaginationLink direction="next" doc={pagination.next} />}
          </nav>
        )}
      </article>

      <aside className="border-gray-a3 hidden w-64 border-s lg:block">
        <div className="sticky top-17 h-[calc(100dvh-4.25rem)] overflow-y-auto py-8 ps-6 pe-6">
          {hasHeadings && (
            <>
              <div className="text-gray8 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                <svg
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="3" cy="4" fill="currentColor" r="1.25" />
                  <circle cx="3" cy="8" fill="currentColor" r="1.25" />
                  <circle cx="3" cy="12" fill="currentColor" r="1.25" />
                  <path d="M6 4h7M6 8h7M6 12h7" stroke="currentColor" strokeLinecap="round" />
                </svg>
                <p>On this page</p>
              </div>
              <ul className="mt-3 flex flex-col gap-1">
                {doc.headings.map((h) => (
                  <li key={h.id} style={{ paddingInlineStart: `${(h.level - 2) * 0.75}rem` }}>
                    <a
                      className="text-gray8 hover:text-gray10 hover:bg-gray-a2 data-[active]:text-gray10 data-[active]:bg-gray-a2 -ms-2 block py-0.5 ps-2 pe-2 text-sm"
                      data-active={activeHeadingId === h.id ? '' : undefined}
                      href={`#${h.id}`}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div
            className="data-[has-headings]:border-gray-a3 data-[has-headings]:mt-4 data-[has-headings]:border-t data-[has-headings]:pt-4"
            data-has-headings={hasHeadings ? '' : undefined}
          >
            <div className="flex flex-col gap-1">
              <a
                className="text-gray8 hover:text-gray10 -ms-2 flex items-center gap-2 py-1 ps-2 text-sm"
                href={editHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconOcticonPencil16 className="size-4 shrink-0" />
                <span>Edit page</span>
              </a>

              <a
                className="text-gray8 hover:text-gray10 -ms-2 flex items-center gap-2 py-1 ps-2 text-sm"
                href={reportIssueHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconOcticonMarkGithub16 className="size-4 shrink-0" />
                <span>Report issue</span>
              </a>

              <button
                className="text-gray8 hover:text-gray10 -ms-2 flex items-center gap-2 py-1 ps-2 text-left text-sm"
                onClick={() => copy()}
                type="button"
              >
                {copied ? (
                  <IconOcticonCheck16 className="text-teal9 size-4 shrink-0" />
                ) : (
                  <IconOcticonCopy16 className="size-4 shrink-0" />
                )}
                <span>Copy page</span>
              </button>

              {doc.lastUpdated && (
                <p className="text-gray8 py-1 text-sm">
                  Last updated {formatLastUpdated(doc.lastUpdated)}
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

// --- Internal ---

const mdxComponents = {
  CodeGroup,
  CodeGroupItem,
  pre: DocsCodeBlock,
  Notice,
  a: (props: React.ComponentProps<'a'>) => {
    const { href, children, ...rest } = props
    if (href?.startsWith('/'))
      return (
        <Link className="text-blue9 hover:underline" to={href}>
          {children}
        </Link>
      )
    return (
      <a className="text-blue9 hover:underline" href={href} {...rest}>
        {children}
      </a>
    )
  },
  blockquote: (props: React.ComponentProps<'blockquote'>) => (
    <blockquote
      className="bg-gray-a2/30 border-gray-a4 text-gray9 mt-4 border-s-4 px-5 py-4 italic [&>p]:mt-0 [&>p]:leading-relaxed [&>p+p]:mt-3"
      {...props}
    />
  ),
  code: (props: React.ComponentProps<'code'>) => (
    <code
      {...props}
      className={['bg-gray-a2 px-1 py-0.5 text-[0.9375em]', props.className]
        .filter(Boolean)
        .join(' ')}
    />
  ),
  h1: (props: React.ComponentProps<'h1'>) =>
    renderHeading('h1', 'text-xl font-bold md:text-2xl', props),
  h2: (props: React.ComponentProps<'h2'>) =>
    renderHeading('h2', 'mt-10 scroll-mt-4 text-lg font-bold md:text-xl', props),
  h3: (props: React.ComponentProps<'h3'>) =>
    renderHeading('h3', 'mt-8 scroll-mt-5 text-base font-bold md:text-lg', props),
  h4: (props: React.ComponentProps<'h4'>) =>
    renderHeading('h4', 'mt-7 scroll-mt-4 text-sm font-bold md:text-base', props),
  hr: () => <hr className="border-gray-a3 my-8" />,
  li: (props: React.ComponentProps<'li'>) => (
    <li className="text-gray9 leading-relaxed" {...props} />
  ),
  ol: (props: React.ComponentProps<'ol'>) => (
    <ol className="text-gray9 mt-4 list-decimal space-y-1 ps-6" {...props} />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p className="text-gray9 mt-4 leading-relaxed" {...props} />
  ),
  ul: (props: React.ComponentProps<'ul'>) => (
    <ul
      className="text-gray9 [&>li]:before:text-gray8 mt-4 list-none space-y-3 ps-0 [&>li]:relative [&>li]:ps-6 [&>li]:before:absolute [&>li]:before:start-0 [&>li]:before:top-0 [&>li]:before:content-['-']"
      {...props}
    />
  ),
}

function renderHeading<Tag extends 'h1' | 'h2' | 'h3' | 'h4'>(
  tag: Tag,
  baseClassName: string,
  props: React.ComponentProps<Tag>,
) {
  const { children, className, id, ...rest } = props

  return React.createElement(
    tag,
    {
      ...rest,
      className: ['group/heading relative -ms-5 ps-5', baseClassName, className]
        .filter(Boolean)
        .join(' '),
      id,
    },
    <>
      {id && (
        <a
          aria-label="Link to section"
          className="text-gray7 hover:text-gray9 focus-visible:text-gray9 absolute start-0 top-1/2 -translate-y-1/2 font-normal no-underline opacity-0 transition-opacity group-focus-within/heading:opacity-100 group-hover/heading:opacity-100 focus:opacity-100"
          href={`#${id}`}
        >
          #
        </a>
      )}
      {children}
    </>,
  )
}

function Notice(props: React.PropsWithChildren<{ title?: string; type?: string }>) {
  const { children, title, type = 'note' } = props
  const label = title ?? noticeTitles[type] ?? noticeTitles.note

  return (
    <div
      className="data-[type=caution]:border-red9/30 data-[type=caution]:bg-red9/8 data-[type=hint]:border-blue9/30 data-[type=hint]:bg-blue9/8 data-[type=important]:border-purple9/30 data-[type=important]:bg-purple9/8 data-[type=note]:border-blue9/30 data-[type=note]:bg-blue9/8 data-[type=tip]:border-green9/30 data-[type=tip]:bg-green9/8 data-[type=warning]:border-amber9/30 data-[type=warning]:bg-amber9/8 mt-6 border p-4 text-sm"
      data-type={type}
      role="note"
    >
      <div
        className="data-[type=caution]:border-red9/30 data-[type=caution]:bg-red9/8 data-[type=caution]:text-red9 data-[type=hint]:border-blue9/30 data-[type=hint]:bg-blue9/8 data-[type=hint]:text-blue9 data-[type=important]:border-purple9/30 data-[type=important]:bg-purple9/8 data-[type=important]:text-purple9 data-[type=note]:border-blue9/30 data-[type=note]:bg-blue9/8 data-[type=note]:text-blue9 data-[type=tip]:border-green9/30 data-[type=tip]:bg-green9/8 data-[type=tip]:text-green9 data-[type=warning]:border-amber9/30 data-[type=warning]:bg-amber9/8 data-[type=warning]:text-amber9 inline-flex items-center gap-1.5 border px-1.5 py-0.5"
        data-type={type}
      >
        <NoticeIcon type={type} />
        <p className="mt-0 text-[0.6875rem] font-medium tracking-wide uppercase">{label}</p>
      </div>

      <div className="[&>*:first-child]:mt-3 [&>*:last-child]:mb-0">{children}</div>
    </div>
  )
}

function CodeGroup(props: React.PropsWithChildren) {
  const { children } = props
  const items = React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement<React.PropsWithChildren<{ label?: string }>> =>
        React.isValidElement(child) && child.type === CodeGroupItem,
    )
    .map((child, index) => ({
      content: child.props.children,
      label:
        child.props.label?.trim() ||
        getCodeGroupLanguage(child.props.children) ||
        `Code ${index + 1}`,
      value: String(index),
    }))
  const [value, setValue] = React.useState(items[0]?.value ?? '0')

  React.useEffect(() => {
    if (items.some((item) => item.value === value)) return
    setValue(items[0]?.value ?? '0')
  }, [items, value])

  if (!items[0]) return <>{children}</>

  return (
    <Tabs.Root onValueChange={(nextValue) => setValue(String(nextValue))} value={value}>
      <div
        className="bg-gray-a1/50 border-gray-a3 mt-6 overflow-hidden border"
        data-docs-code-group=""
      >
        <Tabs.List
          aria-label="Code group"
          className="bg-gray-a1/50 minimal-scrollbar relative flex gap-1 overflow-x-auto overflow-y-hidden px-2"
        >
          <span
            aria-hidden
            className="bg-gray-a3 pointer-events-none absolute inset-x-0 bottom-0 h-px"
          />
          {items.map((item) => (
            <Tabs.Tab
              className="text-gray8 hover:text-gray10 focus-visible:ring-blue8 data-[active]:text-gray10 relative z-10 px-3 py-3 text-sm font-medium whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              key={item.value}
              value={item.value}
            >
              <span
                aria-hidden
                className="bg-gray10 pointer-events-none absolute right-[8px] bottom-0 left-[8px] z-20 h-px opacity-0 data-[active]:opacity-100"
                data-active={value === item.value ? '' : undefined}
              />
              <span className="flex items-center gap-2">
                <CodeGroupTabIcon label={item.label} />
                <span>{item.label}</span>
              </span>
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {items.map((item) => (
          <Tabs.Panel
            className="focus-visible:ring-blue8 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&_[data-docs-code-block]]:mt-0 [&_[data-docs-code-block]_pre]:px-5 [&_pre]:border-0"
            key={item.value}
            value={item.value}
          >
            {item.content}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}

function CodeGroupItem(props: React.PropsWithChildren<{ label?: string }>) {
  const { children } = props
  return <>{children}</>
}

function CodeGroupTabIcon(props: { label: string }) {
  const icon = getCodeGroupTabIcon(props.label)
  if (!icon) return null

  return <icon.Component aria-hidden className="size-4 shrink-0" />
}

function DocsCodeBlock(props: React.ComponentProps<'pre'>) {
  const { children, className, ...rest } = props
  const copyText = getNodeText(children)
  const { copied, copy } = useCopyToClipboard(copyText ? { content: copyText } : {})

  return (
    <div className="group/code relative mt-4" data-docs-code-block="">
      {copyText && (
        <button
          aria-label={copied ? 'Code copied' : 'Copy code'}
          className="bg-bg1/90 border-gray-a3 text-gray8 hover:text-gray10 focus-visible:text-gray10 focus-visible:ring-blue8 absolute end-3 top-3 z-10 border p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-focus-within/code:opacity-100 group-hover/code:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset data-[copied]:opacity-100"
          data-copied={copied ? '' : undefined}
          onClick={() => copy()}
          type="button"
        >
          {copied ? (
            <IconOcticonCheck16 className="text-teal9 size-4" />
          ) : (
            <IconOcticonCopy16 className="size-4" />
          )}
        </button>
      )}

      <pre
        {...rest}
        className={[
          'bg-gray-a1/50 border-gray-a3 minimal-scrollbar focus-visible:ring-blue8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset mt-0 overflow-x-auto border p-4 leading-relaxed',
          '[&_code]:bg-transparent [&_code]:p-0 [&_code]:!text-[1em]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </pre>
    </div>
  )
}

function NoticeIcon(props: { type: string }) {
  const { type } = props

  switch (type) {
    case 'caution':
      return <IconOcticonStop16 aria-hidden className="size-3 shrink-0" />
    case 'hint':
      return <IconOcticonInfo16 aria-hidden className="size-3 shrink-0" />
    case 'important':
      return <IconOcticonReport16 aria-hidden className="size-3 shrink-0" />
    case 'tip':
      return <IconOcticonLightBulb16 aria-hidden className="size-3 shrink-0" />
    case 'warning':
      return <IconOcticonAlert16 aria-hidden className="size-3 shrink-0" />
    default:
      return <IconOcticonInfo16 aria-hidden className="size-3 shrink-0" />
  }
}

function DocPaginationLink(props: {
  direction: 'next' | 'previous'
  doc: { path: string; title: string }
}) {
  const { direction, doc } = props

  return (
    <Link
      className="border-gray-a3 hover:bg-gray-a1/50 flex min-h-24 flex-col gap-2 border px-4 py-3 text-left data-[direction=next]:text-right"
      data-direction={direction}
      to={getDocHref(doc.path)}
    >
      <span className="text-gray8 text-sm">{direction === 'previous' ? 'Previous' : 'Next'}</span>
      <div
        className="flex items-center gap-2 text-sm font-bold data-[direction=next]:justify-end md:text-base"
        data-direction={direction}
      >
        {direction === 'previous' && <IconOcticonChevronLeft16 className="size-5 shrink-0" />}
        <span>{doc.title}</span>
        {direction === 'next' && <IconOcticonChevronRight16 className="size-5 shrink-0" />}
      </div>
    </Link>
  )
}

function getAbsoluteTop(element: HTMLElement) {
  let offsetTop = 0
  let current: HTMLElement | null = element

  while (current !== document.body) {
    if (current === null) return Number.NaN
    offsetTop += current.offsetTop
    current = current.offsetParent as HTMLElement | null
  }

  return offsetTop
}

function getDocHref(path: string) {
  return path ? `/docs/${path}` : '/docs'
}

function formatLastUpdated(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const isCurrentYear = date.getUTCFullYear() === new Date().getUTCFullYear()

  return new Intl.DateTimeFormat('en-US', {
    ...(isCurrentYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date)
}

function getNodeText(node: React.ReactNode): string | undefined {
  const text = nodeToString(node)
  return text || undefined
}

function nodeToString(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map((child) => nodeToString(child)).join('')
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>
    return nodeToString(element.props.children)
  }
  return ''
}

function getCodeGroupLanguage(node: React.ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const language = getCodeGroupLanguage(child)
      if (language) return language
    }

    return undefined
  }

  if (!React.isValidElement(node)) return undefined
  const element = node as React.ReactElement<{ children?: React.ReactNode; className?: string }>
  if (element.type === 'code') {
    const className = typeof element.props.className === 'string' ? element.props.className : ''
    const language = /\blanguage-([\w-]+)/.exec(className)?.[1]
    if (language) return language
  }

  return getCodeGroupLanguage(element.props.children)
}

function getCodeGroupTabIcon(label: string) {
  const normalized = label.trim().toLowerCase()
  if (normalized in codeGroupTabIcons)
    return codeGroupTabIcons[normalized as keyof typeof codeGroupTabIcons]

  const extension = /\.([a-z0-9]+)$/.exec(normalized)?.[1]
  if (extension && extension in codeGroupExtensionIcons)
    return codeGroupExtensionIcons[extension as keyof typeof codeGroupExtensionIcons]

  return undefined
}

const noticeTitles: Record<string, string> = {
  caution: 'Danger',
  hint: 'Hint',
  important: 'Important',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
}

const codeGroupTabIcons = {
  bash: { Component: IconVscodeIconsFileTypeShell },
  bun: { Component: IconVscodeIconsFileTypeBun },
  deno: { Component: IconVscodeIconsFileTypeDeno },
  javascript: { Component: IconVscodeIconsFileTypeJs },
  json: { Component: IconVscodeIconsFileTypeJson },
  markdown: { Component: IconVscodeIconsFileTypeMarkdown },
  npm: { Component: IconVscodeIconsFileTypeNpm },
  pnpm: { Component: IconVscodeIconsFileTypePnpm },
  powershell: { Component: IconVscodeIconsFileTypePowershell },
  shell: { Component: IconVscodeIconsFileTypeShell },
  sh: { Component: IconVscodeIconsFileTypeShell },
  ts: { Component: IconVscodeIconsFileTypeTypescript },
  typescript: { Component: IconVscodeIconsFileTypeTypescript },
  yaml: { Component: IconVscodeIconsFileTypeYaml },
  yarn: { Component: IconVscodeIconsFileTypeYarn },
} as const

const codeGroupExtensionIcons = {
  bash: codeGroupTabIcons.bash,
  cjs: codeGroupTabIcons.javascript,
  js: codeGroupTabIcons.javascript,
  json: codeGroupTabIcons.json,
  jsonc: codeGroupTabIcons.json,
  md: codeGroupTabIcons.markdown,
  mdx: codeGroupTabIcons.markdown,
  mjs: codeGroupTabIcons.javascript,
  ps1: codeGroupTabIcons.powershell,
  sh: codeGroupTabIcons.sh,
  ts: codeGroupTabIcons.typescript,
  tsx: codeGroupTabIcons.typescript,
  yaml: codeGroupTabIcons.yaml,
  yml: codeGroupTabIcons.yaml,
  zsh: codeGroupTabIcons.sh,
} as const
