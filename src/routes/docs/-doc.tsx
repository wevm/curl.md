import { Menu } from '@base-ui/react/menu'
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
import IconVscodeIconsFileTypeLightPnpm from '~icons/vscode-icons/file-type-light-pnpm.jsx'
import IconVscodeIconsFileTypeMarkdown from '~icons/vscode-icons/file-type-markdown.jsx'
import IconVscodeIconsFileTypeNpm from '~icons/vscode-icons/file-type-npm.jsx'
import IconVscodeIconsFileTypePnpm from '~icons/vscode-icons/file-type-pnpm.jsx'
import IconVscodeIconsFileTypePowershell from '~icons/vscode-icons/file-type-powershell.jsx'
import IconVscodeIconsFileTypeShell from '~icons/vscode-icons/file-type-shell.jsx'
import IconVscodeIconsFileTypeTypescript from '~icons/vscode-icons/file-type-typescript.jsx'
import IconVscodeIconsFileTypeYaml from '~icons/vscode-icons/file-type-yaml.jsx'
import IconVscodeIconsFileTypeYarn from '~icons/vscode-icons/file-type-yarn.jsx'
import { useCopyToClipboard } from '#hooks/useCopyToClipboard.ts'
import type { Doc, DocPagination, Heading } from './-doc.types.ts'

export function DocContent(props: { doc: Doc; pagination?: DocPagination }) {
  const { doc, pagination = { next: undefined, previous: undefined } } = props
  const { copied, copy } = useCopyToClipboard({ content: doc.source })
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | undefined>(undefined)
  const [lastUpdatedLabel, setLastUpdatedLabel] = React.useState<string | undefined>(undefined)
  const [mobileOutlineOpen, setMobileOutlineOpen] = React.useState(false)
  const [mobileOutlinePopupWidth, setMobileOutlinePopupWidth] = React.useState<number | undefined>(
    undefined,
  )
  const [mobileOutlinePopupOffset, setMobileOutlinePopupOffset] = React.useState<
    number | undefined
  >(undefined)
  const honorHashUntilRef = React.useRef(0)
  const mobileOutlineBarRef = React.useRef<HTMLDivElement>(null)
  const mobileOutlineTriggerRef = React.useRef<HTMLDivElement>(null)
  const hasHeadings = doc.headings.length > 0
  const hasPagination = Boolean(pagination.previous || pagination.next)
  const activeHeading = doc.headings.find((heading) => heading.id === activeHeadingId)
  const editHref = `https://github.com/wevm/curl.md/edit/main/${doc.sourcePath}`
  const mdxComponents = React.useMemo(
    () => createMdxComponents({ copied, copyPage: copy }),
    [copied, copy],
  )
  const reportIssueHref = 'https://github.com/wevm/curl.md/issues/new/choose'

  const setHashOverride = React.useCallback(() => {
    honorHashUntilRef.current = window.performance.now() + hashHeadingGracePeriodMs
  }, [])

  const selectOutlineHeading = React.useCallback(
    (headingId: string) => {
      setHashOverride()
      setActiveHeadingId((current) => (current === headingId ? current : headingId))
    },
    [setHashOverride],
  )

  React.useEffect(() => {
    if (!doc.lastUpdated) {
      setLastUpdatedLabel(undefined)
      return
    }

    setLastUpdatedLabel(formatLastUpdated(doc.lastUpdated))
  }, [doc.lastUpdated])

  React.useEffect(() => {
    setMobileOutlineOpen(false)
  }, [doc.path])

  React.useEffect(() => {
    const closeMobileOutline = () => setMobileOutlineOpen(false)

    window.addEventListener('hashchange', closeMobileOutline)
    return () => window.removeEventListener('hashchange', closeMobileOutline)
  }, [])

  React.useEffect(() => {
    const bar = mobileOutlineBarRef.current
    const trigger = mobileOutlineTriggerRef.current
    if (!bar || !trigger) return

    const updatePopupWidth = () => {
      const barRect = bar.getBoundingClientRect()
      const triggerRect = trigger.getBoundingClientRect()
      const nextWidth = Number((barRect.width + 0.48).toFixed(2))
      const nextOffset = Number((-(triggerRect.left - barRect.left) - 0.48).toFixed(2))

      setMobileOutlinePopupWidth((current) => (current === nextWidth ? current : nextWidth))
      setMobileOutlinePopupOffset((current) => (current === nextOffset ? current : nextOffset))
    }

    updatePopupWidth()

    const resizeObserver = new ResizeObserver(updatePopupWidth)
    resizeObserver.observe(bar)
    resizeObserver.observe(trigger)
    window.addEventListener('resize', updatePopupWidth)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updatePopupWidth)
    }
  }, [])

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

      const hashHeading = headings.find(
        (heading) => heading.id === decodeURIComponent(window.location.hash.slice(1)),
      )
      const hashHeadingId = hashHeading?.id
      const shouldHonorHash =
        hashHeadingId !== undefined && honorHashUntilRef.current > window.performance.now()

      if (window.scrollY < 1) {
        setActiveHeadingId((current) => (current === undefined ? current : undefined))
        return
      }

      let nextActiveHeadingId: string | undefined = undefined

      for (const heading of headings) {
        if (heading.top <= window.scrollY + fixedNavbarHeightPx + thresholdOffsetPx)
          nextActiveHeadingId = heading.id
        else break
      }

      if (
        shouldHonorHash &&
        hashHeading &&
        isHeadingVisibleInViewport(hashHeading.element, fixedNavbarHeightPx, thresholdOffsetPx)
      ) {
        nextActiveHeadingId = hashHeading.id
      }

      if (nextActiveHeadingId === undefined && shouldHonorHash) nextActiveHeadingId = hashHeadingId

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

    const onHashChange = () => {
      setHashOverride()
      syncActiveHeading()
    }

    if (window.location.hash) setHashOverride()
    requestAnimationFrame(syncActiveHeading)
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('resize', syncActiveHeading)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId)
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('resize', syncActiveHeading)
      window.removeEventListener('scroll', onScroll)
    }
  }, [doc.path, doc.headings, hasHeadings])

  return (
    <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 lg:grid-cols-[minmax(0,56rem)_16rem] lg:gap-12">
      {hasHeadings && (
        <div
          className="bg-bg1 border-gray-a3 sticky top-17 z-30 [margin-inline:calc(50%-50vw)] border-b md:[margin-inline:0] md:mx-0 md:[margin-inline-start:-3rem] md:[inline-size:calc(100%+3rem)] lg:hidden"
          ref={mobileOutlineBarRef}
        >
          <div className="mx-auto w-full max-w-[76rem] md:mx-0 md:max-w-none">
            <div className="flex items-center gap-4 px-4 py-2">
              <Menu.Root modal={false} onOpenChange={setMobileOutlineOpen} open={mobileOutlineOpen}>
                <div ref={mobileOutlineTriggerRef}>
                  <Menu.Trigger
                    className="border-gray-a5 text-gray9 hover:bg-gray-a2 hover:text-gray10 data-[popup-open]:bg-gray-a2 data-[popup-open]:text-gray10 flex shrink-0 items-center gap-2.5 rounded-none border px-2 py-2 text-xs font-medium outline-none"
                    data-mobile-doc-outline-trigger=""
                  >
                    <span>On this page</span>
                    <svg
                      aria-hidden="true"
                      className={['size-3.5 shrink-0', mobileOutlineOpen ? 'rotate-90' : undefined]
                        .filter(Boolean)
                        .join(' ')}
                      fill="none"
                      viewBox="0 0 16 16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="m6 4 4 4-4 4"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </Menu.Trigger>
                </div>

                <Menu.Portal>
                  <Menu.Positioner
                    align="start"
                    className="z-40 min-w-[var(--anchor-width)]"
                    collisionAvoidance={{ align: 'none', fallbackAxisSide: 'none', side: 'none' }}
                    collisionPadding={0}
                    sideOffset={8}
                  >
                    <Menu.Popup
                      className="bg-bg1 border-gray-a3 max-h-[min(24rem,calc(100dvh-9rem))] overflow-x-hidden overflow-y-auto border p-0 shadow-2xl outline-none"
                      data-doc-mobile-outline-panel=""
                      id="docs-mobile-outline"
                      style={
                        mobileOutlinePopupWidth && mobileOutlinePopupOffset !== undefined
                          ? {
                              inlineSize: `${mobileOutlinePopupWidth}px`,
                              marginInlineStart: `${mobileOutlinePopupOffset}px`,
                            }
                          : undefined
                      }
                    >
                      <Menu.Item
                        className="text-gray8 data-[active]:text-gray10 data-[highlighted]:bg-gray-a2 data-[highlighted]:text-gray10 focus-visible:ring-blue8 flex items-center gap-3 px-6 py-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-inset"
                        closeOnClick
                        data-active={activeHeadingId === undefined ? '' : undefined}
                        onClick={() => setMobileOutlineOpen(false)}
                        render={<a href={getDocHref(doc.path)} />}
                      >
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                          Overview
                        </span>
                        {activeHeadingId === undefined && (
                          <IconOcticonCheck16 className="text-blue9 size-4 shrink-0" />
                        )}
                      </Menu.Item>

                      <div className="border-gray-a3 border-t" />

                      {doc.headings.map((heading) => (
                        <Menu.Item
                          className="text-gray8 data-[active]:text-gray10 data-[highlighted]:bg-gray-a2 data-[highlighted]:text-gray10 focus-visible:ring-blue8 flex items-center gap-3 px-6 py-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-inset"
                          closeOnClick
                          data-active={activeHeadingId === heading.id ? '' : undefined}
                          key={heading.id}
                          onClick={() => {
                            selectOutlineHeading(heading.id)
                            setMobileOutlineOpen(false)
                          }}
                          render={<a href={`#${heading.id}`} />}
                        >
                          <span
                            className="min-w-0 flex-1 text-left"
                            style={{ paddingInlineStart: `${(heading.level - 2) * 1}rem` }}
                          >
                            <OutlineHeadingText text={heading.text} truncate />
                          </span>
                          {activeHeadingId === heading.id && (
                            <IconOcticonCheck16 className="text-blue9 size-4 shrink-0" />
                          )}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>

              <p
                className="text-gray10 min-w-0 flex-1 truncate text-xs font-medium"
                data-mobile-doc-outline-current-heading=""
              >
                {activeHeading?.text ?? 'Overview'}
              </p>
            </div>
          </div>
        </div>
      )}

      <article className="min-w-0 px-5 py-8 md:px-12 md:max-lg:-ms-12 md:max-lg:w-[calc(100%+3rem)] md:max-lg:px-8 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-0">
        <doc.Component components={mdxComponents} />

        {(doc.lastUpdated || hasPagination) && (
          <div className="mt-14">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <a
                className="text-gray8 hover:text-gray10 flex items-center gap-2 text-sm font-medium"
                href={editHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconOcticonPencil16 className="size-4 shrink-0" />
                <span>Edit page</span>
              </a>

              {doc.lastUpdated && (
                <p className="text-gray8 text-sm">
                  {lastUpdatedLabel ? `Last updated: ${lastUpdatedLabel}` : ''}
                </p>
              )}
            </div>

            {hasPagination && (
              <nav className="border-gray-a3 mt-5 grid gap-4 border-t pt-6 sm:grid-cols-2">
                {pagination.previous ? (
                  <DocPaginationLink direction="previous" doc={pagination.previous} />
                ) : (
                  <div className="hidden sm:block" />
                )}
                {pagination.next && <DocPaginationLink direction="next" doc={pagination.next} />}
              </nav>
            )}
          </div>
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
              <DesktopDocOutline
                activeHeadingId={activeHeadingId}
                headings={doc.headings}
                onHeadingSelect={selectOutlineHeading}
              />
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

              <CopyPageButton
                className="text-gray8 hover:text-gray10 -ms-2 hidden py-1 ps-2 text-sm lg:flex"
                copyPage={copy}
                copied={copied}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

// --- Internal ---

function createMdxComponents(props: { copyPage: () => void; copied: boolean }) {
  const { copied, copyPage } = props

  return {
    CodeGroup,
    CodeGroupItem,
    pre: DocsCodeBlock,
    Notice,
    Step,
    Steps,
    table: DocsTable,
    tbody: DocsTableBody,
    td: DocsTableCell,
    th: DocsTableHeaderCell,
    thead: DocsTableHead,
    tr: DocsTableRow,
    a: (anchorProps: React.ComponentProps<'a'>) => {
      const { href, children, ...rest } = anchorProps
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
    blockquote: (blockquoteProps: React.ComponentProps<'blockquote'>) => (
      <blockquote
        className="border-gray-a4 mt-4 border-s-4 [background-color:var(--color-docs-surface)] px-5 py-4 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))] [&>p]:mt-0 [&>p]:leading-relaxed [&>p+p]:mt-3"
        {...blockquoteProps}
      />
    ),
    code: DocsInlineCode,
    h1: (headingProps: React.ComponentProps<'h1'>) =>
      renderPageHeading({ copied, copyPage, ...headingProps }),
    h2: (headingProps: React.ComponentProps<'h2'>) =>
      renderHeading(
        'h2',
        'mt-10 scroll-mt-[7rem] text-lg font-bold md:text-xl lg:scroll-mt-4',
        headingProps,
      ),
    h3: (headingProps: React.ComponentProps<'h3'>) =>
      renderHeading(
        'h3',
        'mt-8 scroll-mt-[7rem] text-base font-bold md:text-lg lg:scroll-mt-5',
        headingProps,
      ),
    h4: (headingProps: React.ComponentProps<'h4'>) =>
      renderHeading(
        'h4',
        'mt-7 scroll-mt-[7rem] text-sm font-bold md:text-base lg:scroll-mt-4',
        headingProps,
      ),
    hr: () => <hr className="border-gray-a3 my-8" />,
    li: (listItemProps: React.ComponentProps<'li'>) => (
      <li
        className="leading-relaxed text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]"
        {...listItemProps}
      />
    ),
    ol: (listProps: React.ComponentProps<'ol'>) => (
      <ol
        className="mt-4 list-decimal space-y-1 ps-6 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]"
        {...listProps}
      />
    ),
    p: (paragraphProps: React.ComponentProps<'p'>) => (
      <p
        className="mt-4 leading-relaxed text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]"
        {...paragraphProps}
      />
    ),
    ul: (listProps: React.ComponentProps<'ul'>) => (
      <ul
        className="[&>li]:before:text-gray9 mt-4 list-none space-y-3 ps-0 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))] [&>li]:relative [&>li]:ps-6 [&>li]:before:absolute [&>li]:before:start-0 [&>li]:before:top-0 [&>li]:before:content-['-']"
        {...listProps}
      />
    ),
  }
}

function CopyPageButton(
  props: {
    className: string
    copyPage: () => void
    copied: boolean
  } & React.ComponentProps<'button'>,
) {
  const { className, copied, copyPage, ...rest } = props

  return (
    <button
      {...rest}
      className={['flex items-center gap-2 text-left', className].filter(Boolean).join(' ')}
      onClick={() => copyPage()}
      type="button"
    >
      {copied ? (
        <IconOcticonCheck16 className="text-teal9 size-4 shrink-0" />
      ) : (
        <IconOcticonCopy16 className="size-4 shrink-0" />
      )}
      <span>Copy page</span>
    </button>
  )
}

function DesktopDocOutline(props: {
  activeHeadingId: string | undefined
  headings: Array<Heading>
  onHeadingSelect: (headingId: string) => void
}) {
  const { activeHeadingId, headings, onHeadingSelect } = props

  return (
    <ul className="mt-3 flex flex-col gap-1">
      {headings.map((heading) => (
        <li key={heading.id} style={{ paddingInlineStart: `${(heading.level - 2) * 0.75}rem` }}>
          <a
            aria-current={activeHeadingId === heading.id ? 'location' : undefined}
            className="text-gray8 hover:text-gray10 hover:bg-gray-a2 data-[active]:text-gray10 data-[active]:bg-gray-a2 -ms-2 block py-1 ps-2 pe-2 text-sm"
            data-active={activeHeadingId === heading.id ? '' : undefined}
            href={`#${heading.id}`}
            onMouseDown={() => onHeadingSelect(heading.id)}
            onClick={() => onHeadingSelect(heading.id)}
          >
            <OutlineHeadingText text={heading.text} />
          </a>
        </li>
      ))}
    </ul>
  )
}

function OutlineHeadingText(props: { text: string; truncate?: boolean }) {
  const { text, truncate } = props
  const numberedHeading = splitNumberedHeading(text)
  if (!numberedHeading)
    return <span className={truncate ? 'block truncate' : undefined}>{text}</span>

  return (
    <span className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
      <span className="shrink-0">{numberedHeading.number}</span>
      <span className={truncate ? 'truncate' : undefined}>{numberedHeading.title}</span>
    </span>
  )
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

function renderPageHeading(
  props: React.ComponentProps<'h1'> & { copied: boolean; copyPage: () => void },
) {
  const { children, className, copied, copyPage, id, ...rest } = props

  return (
    <h1
      {...rest}
      className={[
        'flex items-start justify-between gap-4 scroll-mt-[7rem] text-xl font-bold lg:scroll-mt-0 md:text-2xl',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      id={id}
    >
      <span className="group/heading relative -ms-5 min-w-0 flex-1 ps-5">
        {id && (
          <a
            aria-label="Link to section"
            className="text-gray7 hover:text-gray9 focus-visible:text-gray9 absolute start-0 top-1/2 -translate-y-1/2 font-normal no-underline opacity-0 transition-opacity group-focus-within/heading:opacity-100 group-hover/heading:opacity-100 hover:opacity-100 focus:opacity-100"
            data-heading-anchor=""
            href={`#${id}`}
          >
            #
          </a>
        )}

        <span className="block min-w-0" data-heading-title="">
          {children}
        </span>
      </span>

      <CopyPageButton
        className="text-gray8 hover:text-gray10 mt-1 self-start text-sm lg:hidden"
        copyPage={copyPage}
        copied={copied}
        data-doc-mobile-copy-page=""
      />
    </h1>
  )
}

function DocsInlineCode(props: React.ComponentProps<'code'>) {
  return (
    <code
      {...props}
      className={['bg-gray-a2 px-1 py-0.5 text-[0.9375em]', props.className]
        .filter(Boolean)
        .join(' ')}
    />
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

function DocsTable(props: React.ComponentProps<'table'>) {
  return (
    <div className="minimal-scrollbar mt-6 overflow-x-auto" data-docs-table="">
      <table
        {...props}
        className={['min-w-full border-collapse text-sm', props.className]
          .filter(Boolean)
          .join(' ')}
      />
    </div>
  )
}

function DocsTableHead(props: React.ComponentProps<'thead'>) {
  return (
    <thead
      className={['border-gray-a3 border-b', props.className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}

function DocsTableBody(props: React.ComponentProps<'tbody'>) {
  return <tbody className={props.className} {...props} />
}

function DocsTableRow(props: React.ComponentProps<'tr'>) {
  return (
    <tr
      className={['border-gray-a3 border-b', props.className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}

function DocsTableHeaderCell(props: React.ComponentProps<'th'>) {
  return (
    <th
      {...props}
      className={[
        'bg-gray-a1 text-gray10 px-4 py-3 text-left font-medium whitespace-nowrap',
        props.className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

function DocsTableCell(props: React.ComponentProps<'td'>) {
  return (
    <td
      {...props}
      className={[
        'text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))] px-4 py-3 align-top whitespace-nowrap',
        props.className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

function Steps(props: React.PropsWithChildren) {
  const { children } = props
  const stepSlugCounts = new Map<string, number>()
  const items = React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement<React.PropsWithChildren<{ title?: string }>> =>
        React.isValidElement(child) && child.type === Step,
    )
    .map((child, index) => ({
      content: child.props.children,
      id: getStepId(child.props.title?.trim() || `Step ${index + 1}`, stepSlugCounts),
      title: child.props.title?.trim() || `Step ${index + 1}`,
    }))

  if (!items[0]) return <>{children}</>

  return (
    <ol className="mt-6 list-none ps-0" data-docs-steps="">
      {items.map((item, index) => (
        <li
          className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 pb-10 last:pb-0 md:grid-cols-[2.5rem_minmax(0,1fr)] md:gap-4"
          data-docs-step=""
          key={`${index}-${item.title}`}
        >
          <div className="relative -mt-px flex justify-center md:-mt-0.5">
            <a
              aria-label={`Link to step: ${item.title}`}
              className="bg-gray-a3 text-gray11 hover:bg-gray-a4 hover:text-gray12 focus-visible:ring-blue8 relative z-10 flex size-7 items-center justify-center rounded-full text-sm font-medium no-underline transition-[background-color,color] outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg1)] md:size-8 md:text-[0.9375rem]"
              href={`#${item.id}`}
            >
              {index + 1}
            </a>
            <span
              aria-hidden
              className="bg-gray-a3 absolute start-1/2 top-7 bottom-[-2rem] w-px -translate-x-1/2 data-[last]:hidden md:top-8 md:bottom-[-2.25rem]"
              data-last={index === items.length - 1 ? '' : undefined}
            />
          </div>

          <div className="min-w-0">
            <h3
              className="text-gray12 scroll-mt-[7rem] text-lg font-bold md:text-xl lg:scroll-mt-5"
              id={item.id}
            >
              {item.title}
            </h3>
            <div className="[&>*:first-child]:mt-4 [&>*:last-child]:mb-0">{item.content}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Step(props: React.PropsWithChildren<{ title?: string }>) {
  const { children } = props
  return <>{children}</>
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
        className="border-gray-a3 mt-6 overflow-hidden border [background-color:var(--color-docs-surface)]"
        data-docs-code-group=""
      >
        <Tabs.List
          aria-label="Code group"
          className="minimal-scrollbar relative flex gap-1 overflow-x-auto overflow-y-hidden [background-color:var(--color-docs-surface)] px-2"
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

  if (icon === codeGroupTabIcons.pnpm) return <CodeGroupPnpmIcon />

  return <icon.Component aria-hidden className="size-4 shrink-0" />
}

function DocsCodeBlock(props: React.ComponentProps<'pre'>) {
  const { children, className, style, title, ...rest } = props
  const copyText = getCodeBlockText(children)
  const promptShellLines = React.useMemo(() => getPromptShellLines(children), [children])
  const renderedChildren = React.useMemo(
    () =>
      promptShellLines
        ? replaceCodeElement(children, (codeElement) =>
            renderPromptCopyCodeElement(codeElement, promptShellLines),
          )
        : children,
    [children, promptShellLines],
  )
  const label = typeof title === 'string' && title.trim() ? title.trim() : undefined
  const shouldShowCopyButton = Boolean(copyText && !promptShellLines)
  const { copied, copy } = useCopyToClipboard(copyText ? { content: copyText } : {})

  return (
    <div className="group/code relative mt-4" data-docs-code-block="">
      {label && (
        <div
          className="border-gray-a3 border [background-color:var(--color-docs-surface)]"
          data-docs-code-title=""
        >
          <span className="text-gray10 flex min-w-0 items-center gap-2 px-4 py-3 pe-14 text-sm font-medium whitespace-nowrap">
            <CodeGroupTabIcon label={label} />
            <span className="truncate">{label}</span>
          </span>
        </div>
      )}

      {shouldShowCopyButton && (
        <CodeBlockCopyButton
          copied={copied}
          floating
          headerAligned={Boolean(label)}
          hoverOnly={!label}
          onClick={() => copy()}
        />
      )}

      <pre
        {...rest}
        className={[
          '[background-color:var(--color-docs-surface)] border-gray-a3 minimal-scrollbar focus-visible:ring-blue8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset mt-0 overflow-x-auto border p-4 leading-relaxed',
          label ? 'border-t-0' : undefined,
          label ? 'pt-3' : undefined,
          '[&_code]:bg-transparent [&_code]:p-0 [&_code]:!text-[1em]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ ...style, backgroundColor: 'var(--color-docs-surface)' }}
      >
        {renderedChildren}
      </pre>
    </div>
  )
}

function CodeBlockCopyButton(props: {
  copied: boolean
  floating?: boolean
  headerAligned?: boolean
  hoverOnly?: boolean
  onClick: () => void
}) {
  const { copied, floating, headerAligned, hoverOnly, onClick } = props

  return (
    <button
      aria-label={copied ? 'Code copied' : 'Copy code'}
      className={[
        'text-gray8 hover:text-gray10 focus-visible:text-gray10 focus-visible:ring-blue8 z-10 p-1.5 [background-color:var(--color-docs-surface)] focus:outline-none focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset data-[copied]:opacity-100',
        floating
          ? headerAligned
            ? 'absolute end-3 top-[1.375rem] -translate-y-1/2'
            : 'absolute end-3 top-3'
          : 'me-3 shrink-0',
        hoverOnly
          ? 'opacity-0 transition-opacity group-focus-within/code:opacity-100 group-hover/code:opacity-100 focus:opacity-100'
          : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
      data-copied={copied ? '' : undefined}
      onClick={onClick}
      type="button"
    >
      {copied ? (
        <IconOcticonCheck16 className="text-teal9 size-4" />
      ) : (
        <IconOcticonCopy16 className="size-4" />
      )}
    </button>
  )
}

function CodeGroupPnpmIcon() {
  return (
    <>
      <IconVscodeIconsFileTypeLightPnpm aria-hidden className="size-4 shrink-0 dark:hidden" />
      <IconVscodeIconsFileTypePnpm aria-hidden className="hidden size-4 shrink-0 dark:block" />
    </>
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
      className="border-gray-a3 hover:bg-gray-a1/50 flex flex-col gap-1 border px-5 py-4 text-left transition-colors data-[direction=next]:items-end data-[direction=next]:text-right"
      data-direction={direction}
      to={getDocHref(doc.path)}
    >
      <span className="text-gray8 text-sm">
        {direction === 'previous' ? 'Previous page' : 'Next page'}
      </span>
      <span className="text-gray10 text-sm font-medium md:text-base">{doc.title}</span>
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

function isHeadingVisibleInViewport(
  element: HTMLElement,
  fixedNavbarHeightPx: number,
  thresholdOffsetPx: number,
) {
  const rect = element.getBoundingClientRect()
  const viewportTop = fixedNavbarHeightPx + thresholdOffsetPx

  return rect.bottom > viewportTop && rect.top < window.innerHeight
}

function getDocHref(path: string) {
  return path ? `/docs/${path}` : '/docs'
}

function formatLastUpdated(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  })
    .formatToParts(date)
    .map((part) => (part.type === 'literal' ? part.value.replace(' at ', ' ') : part.value))
    .join('')
    .trim()
}

function getNodeText(node: React.ReactNode): string | undefined {
  const text = nodeToString(node)
  return text || undefined
}

function getCodeBlockText(node: React.ReactNode): string | undefined {
  const codeElement = getCodeElement(node)
  if (!codeElement) return getNodeText(node)

  const lines = getCodeElementTextLines(codeElement)
  const text = lines.join('\n').replace(/\n+$/, '')
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

function getPromptShellLines(node: React.ReactNode) {
  const codeElement = getCodeElement(node)
  if (!codeElement) return undefined

  const language = getCodeElementLanguage(codeElement)
  if (!language || !shellCodeLanguages.has(language)) return undefined

  const lines = getCodeElementLineElements(codeElement)
  const nonEmptyLines = lines.filter((line) => line.text.trim() !== '')
  if (!nonEmptyLines.length || nonEmptyLines.some((line) => !line.text.startsWith('$ ')))
    return undefined

  return lines.map((line) => ({
    childIndex: line.childIndex,
    text: line.text.slice(2),
  }))
}

function getCodeElement(node: React.ReactNode): CodeElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const codeElement = getCodeElement(child)
      if (codeElement) return codeElement
    }

    return undefined
  }

  if (!React.isValidElement(node)) return undefined
  const element = node as React.ReactElement<{ children?: React.ReactNode; className?: string }>
  if (element.type === 'code' || element.type === DocsInlineCode) return element

  return getCodeElement(element.props.children)
}

function getCodeElementLanguage(codeElement: CodeElement | undefined): string | undefined {
  const className =
    typeof codeElement?.props.className === 'string' ? codeElement.props.className : ''
  return /\blanguage-([\w-]+)/.exec(className)?.[1]
}

function getCodeElementLineElements(codeElement: CodeElement) {
  return React.Children.toArray(codeElement.props.children)
    .map((child, childIndex) => {
      if (!isCodeLineElement(child)) return undefined

      return {
        childIndex,
        text: nodeToString(child.props.children),
      }
    })
    .filter((line): line is { childIndex: number; text: string } => line !== undefined)
}

function getCodeElementTextLines(codeElement: CodeElement) {
  const lines = getCodeElementLineElements(codeElement)
  if (lines.length) return lines.map((line) => line.text)

  const text = nodeToString(codeElement.props.children)
  return text ? text.split('\n') : []
}

function isCodeLineElement(node: React.ReactNode): node is CodeLineElement {
  if (!React.isValidElement(node)) return false

  const element = node as React.ReactElement<{ children?: React.ReactNode; className?: string }>
  return typeof element.props.className === 'string' && /\bline\b/.test(element.props.className)
}

function replaceCodeElement(
  node: React.ReactNode,
  replace: (codeElement: CodeElement) => React.ReactNode,
): React.ReactNode {
  if (Array.isArray(node)) return node.map((child) => replaceCodeElement(child, replace))
  if (!React.isValidElement(node)) return node

  const element = node as React.ReactElement<{ children?: React.ReactNode; className?: string }>
  if (element.type === 'code' || element.type === DocsInlineCode) return replace(element)
  if (element.props.children === undefined) return node

  return React.cloneElement(element, undefined, replaceCodeElement(element.props.children, replace))
}

function renderPromptCopyCodeElement(
  codeElement: CodeElement,
  promptShellLines: Array<{ childIndex: number; text: string }>,
) {
  const codeChildren = React.Children.toArray(codeElement.props.children)
  const promptLineMap = new Map(promptShellLines.map((line) => [line.childIndex, line.text]))

  return React.cloneElement(
    codeElement,
    undefined,
    codeChildren.flatMap((child, childIndex) => {
      if (typeof child === 'string' && child.trim() === '') return []
      if (!isCodeLineElement(child)) return [child]

      const text = promptLineMap.get(childIndex)
      if (!text) return [child]

      return React.cloneElement(
        child,
        {
          className: [child.props.className, 'group/command flex w-full items-center gap-3']
            .filter(Boolean)
            .join(' '),
        },
        <>
          <span
            aria-hidden
            className="text-gray8 shrink-0 opacity-70 select-none"
            data-command-prompt=""
          >
            $
          </span>
          <span className="min-w-0 flex-1">
            {stripLeadingCharacters(child.props.children, 2).node}
          </span>
          <PromptCopyButton text={text} />
        </>,
      )
    }),
  )
}

function PromptCopyButton(props: { text: string }) {
  const { text } = props
  const { copied, copy } = useCopyToClipboard({ content: text })

  return (
    <button
      aria-label={`Copy command: ${text}`}
      className="text-gray8 hover:text-gray10 focus-visible:text-gray10 focus-visible:ring-blue8 -m-1 shrink-0 p-1 opacity-0 transition-opacity group-focus-within/command:opacity-100 group-hover/command:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset data-[copied]:opacity-100"
      data-copied={copied ? '' : undefined}
      data-copy-command=""
      onClick={() => copy()}
      type="button"
    >
      {copied ? (
        <IconOcticonCheck16 className="text-teal9 size-4" />
      ) : (
        <IconOcticonCopy16 className="size-4" />
      )}
    </button>
  )
}

function stripLeadingCharacters(
  node: React.ReactNode,
  count: number,
): {
  node: React.ReactNode
  remaining: number
} {
  if (count <= 0) return { node, remaining: 0 }

  if (typeof node === 'string') {
    if (node.length <= count) return { node: '', remaining: count - node.length }
    return { node: node.slice(count), remaining: 0 }
  }

  if (typeof node === 'number') return stripLeadingCharacters(String(node), count)
  if (node === null || node === undefined || typeof node === 'boolean')
    return { node, remaining: count }

  if (Array.isArray(node)) {
    const children: Array<React.ReactNode> = []
    let remaining = count

    for (const child of React.Children.toArray(node)) {
      const stripped = stripLeadingCharacters(child, remaining)
      remaining = stripped.remaining
      if (stripped.node === '') continue
      children.push(...React.Children.toArray(stripped.node))
    }

    return { node: children, remaining }
  }

  if (!React.isValidElement(node)) return { node, remaining: count }

  const element = node as React.ReactElement<{ children?: React.ReactNode }>
  const strippedChildren = stripLeadingCharacters(element.props.children, count)
  return {
    node: React.cloneElement(element, undefined, strippedChildren.node),
    remaining: strippedChildren.remaining,
  }
}

function getCodeGroupLanguage(node: React.ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const language = getCodeGroupLanguage(child)
      if (language) return language
    }

    return undefined
  }

  return getCodeElementLanguage(getCodeElement(node))
}

function getStepId(title: string, stepSlugCounts: Map<string, number>) {
  const baseSlug = slugifyHeading(title) || 'step'
  const count = stepSlugCounts.get(baseSlug) ?? 0
  stepSlugCounts.set(baseSlug, count + 1)
  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`
}

function splitNumberedHeading(text: string) {
  const match = /^(\d+\.)(?:\s+)(.+)$/u.exec(text.trim())
  if (!match) return

  return {
    number: match[1],
    title: match[2],
  }
}

const hashHeadingGracePeriodMs = 250 // 0.25 seconds

function getCodeGroupTabIcon(label: string) {
  const normalized = label.trim().toLowerCase()
  if (normalized in codeGroupTabIcons)
    return codeGroupTabIcons[normalized as keyof typeof codeGroupTabIcons]

  const extension = /\.([a-z0-9]+)$/.exec(normalized)?.[1]
  if (extension && extension in codeGroupExtensionIcons)
    return codeGroupExtensionIcons[extension as keyof typeof codeGroupExtensionIcons]

  return undefined
}

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`'".(),/#!?]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

const shellCodeLanguages = new Set(['bash', 'shell', 'sh', 'zsh'])

type CodeElement = React.ReactElement<{ children?: React.ReactNode; className?: string }>
type CodeLineElement = React.ReactElement<{ children?: React.ReactNode; className?: string }>
