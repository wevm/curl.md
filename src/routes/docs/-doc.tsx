import { Link } from '@tanstack/react-router'
import * as React from 'react'
import IconOcticonAlert16 from '~icons/octicon/alert16.jsx'
import IconOcticonInfo16 from '~icons/octicon/info16.jsx'
import IconOcticonLightBulb16 from '~icons/octicon/light-bulb16.jsx'
import IconOcticonReport16 from '~icons/octicon/report16.jsx'
import IconOcticonStop16 from '~icons/octicon/stop16.jsx'
import { useCopyToClipboard } from '#hooks/useCopyToClipboard.ts'
import type { Doc, DocPagination } from './-doc.types.ts'

export function DocContent(props: { doc: Doc; pagination?: DocPagination }) {
  const { doc, pagination = { next: undefined, previous: undefined } } = props
  const { copied, copy } = useCopyToClipboard()
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | undefined>(undefined)
  const hasHeadings = doc.headings.length > 0
  const editHref = `https://github.com/wevm/curl.md/edit/main/${doc.sourcePath}`

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
                <IconOcticonMarkGithub16 className="size-4 shrink-0" />
                <span>Edit page on GitHub</span>
              </a>

              <button
                className="text-gray8 hover:text-gray10 -ms-2 flex items-center gap-2 py-1 ps-2 text-left text-sm"
                onClick={() => copy(window.location.href.replace(window.location.hash, ''))}
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
    <code className="bg-gray-a2 px-1 py-0.5 text-[0.875em]" {...props} />
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
  pre: (props: React.ComponentProps<'pre'>) => (
    <pre
      className="bg-gray-a1/50 border-gray-a3 minimal-scrollbar mt-4 overflow-x-auto border p-4 leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
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
        className="flex items-center gap-2 text-base font-bold data-[direction=next]:justify-end md:text-lg"
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

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date)
}

const noticeTitles: Record<string, string> = {
  caution: 'Danger',
  hint: 'Hint',
  important: 'Important',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
}
