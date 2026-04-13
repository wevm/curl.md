import { Combobox } from '@base-ui/react/combobox'
import { Menu } from '@base-ui/react/menu'
import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod/v4'
import IconOcticonFile from '~icons/octicon/file.jsx'
import IconOcticonSearch16 from '~icons/octicon/search-16.jsx'
import { Dialog } from '#components/Dialog.tsx'
import { Nav } from '#components/Nav.tsx'
import { type Theme, useTheme } from '#hooks/useTheme.ts'
import { getSessionLogin } from '#server/session.ts'
import { navbarLinks, type NavbarLink } from '../../../docs/_config.ts'
import { sidebar, type SidebarItem } from '../../../docs/_sidebar.ts'
import { searchDocs } from './-docs.ts'
import type { DocSearchResult } from './-search.ts'
import { getThemeIconTheme } from './-theme.ts'

const searchSchema = z.object({
  q: z.string().optional(),
})

export const Route = createFileRoute('/docs')({
  async loader({ location }) {
    return {
      login: await getSessionLogin(),
      next: location.publicHref ?? location.pathname,
    }
  },
  validateSearch: searchSchema,
  component: Component,
})

const docsSearchQueryUrlSyncDelayMs = 150 // 150 milliseconds
const recentDocsSearchResultsLimit = 5
const recentDocsSearchResultsStorageKey = 'docs-recent-search-results'
const docsSearchShowDetailsStorageKey = 'docs-search-show-details'

function Component() {
  const navigate = useNavigate()
  const { login, next } = Route.useLoaderData()
  const searchQueryFromUrl = Route.useSearch({ select: (search) => search.q ?? '' })
  const [open, setOpen] = React.useState(false)
  const [recentSearchResults, setRecentSearchResults] =
    React.useState<Array<DocSearchResult> | null>(null)
  const [searchShowDetailsLoaded, setSearchShowDetailsLoaded] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchShowDetails, setSearchShowDetails] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const searchOpenRef = React.useRef(searchOpen)
  const searchQueryRef = React.useRef(searchQuery)
  const searchTriggerRef = React.useRef<HTMLButtonElement>(null)
  const restoreSearchTriggerFocusRef = React.useRef(false)
  const searchResults = React.useMemo(() => searchDocs(searchQuery), [searchQuery])
  const [, startSearchQueryUrlTransition] = React.useTransition()

  const updateSearchQueryInUrl = React.useCallback(
    (query: string) => {
      const normalizedQuery = normalizeDocsSearchQuery(query)
      if (normalizedQuery === normalizeDocsSearchQuery(searchQueryFromUrl)) return

      startSearchQueryUrlTransition(() => {
        navigate({
          replace: true,
          resetScroll: false,
          search: (search) => ({
            ...search,
            q: normalizedQuery || undefined,
          }),
          to: '.',
        })
      })
    },
    [navigate, searchQueryFromUrl],
  )

  const saveRecentSearchResult = React.useCallback((result: DocSearchResult) => {
    setRecentSearchResults((current) => getNextRecentDocsSearchResults(current ?? [], result))
  }, [])

  const closeSearch = React.useCallback(
    (options?: { restoreTriggerFocus?: boolean; syncQueryToUrl?: boolean }) => {
      const shouldRestoreFocus =
        options?.restoreTriggerFocus ?? restoreSearchTriggerFocusRef.current

      setSearchOpen(false)
      setSearchQuery('')
      restoreSearchTriggerFocusRef.current = false
      if (options?.syncQueryToUrl ?? true) updateSearchQueryInUrl('')

      if (shouldRestoreFocus) requestAnimationFrame(() => searchTriggerRef.current?.focus())
    },
    [updateSearchQueryInUrl],
  )

  React.useEffect(() => {
    searchOpenRef.current = searchOpen
  }, [searchOpen])

  React.useEffect(() => {
    searchQueryRef.current = searchQuery
  }, [searchQuery])

  React.useEffect(() => {
    setRecentSearchResults(readRecentDocsSearchResults())
    setSearchShowDetails(readDocsSearchShowDetails())
    setSearchShowDetailsLoaded(true)
  }, [])

  React.useEffect(() => {
    if (recentSearchResults === null) return
    window.localStorage.setItem(
      recentDocsSearchResultsStorageKey,
      JSON.stringify(recentSearchResults),
    )
  }, [recentSearchResults])

  React.useEffect(() => {
    if (!searchShowDetailsLoaded) return
    window.localStorage.setItem(docsSearchShowDetailsStorageKey, JSON.stringify(searchShowDetails))
  }, [searchShowDetails, searchShowDetailsLoaded])

  React.useEffect(() => {
    const normalizedSearchQueryFromUrl = normalizeDocsSearchQuery(searchQueryFromUrl)

    if (normalizedSearchQueryFromUrl) {
      if (!searchOpenRef.current) setSearchOpen(true)
      if (searchQueryRef.current !== normalizedSearchQueryFromUrl)
        setSearchQuery(normalizedSearchQueryFromUrl)
      return
    }

    if (!searchQueryRef.current) return
    setSearchOpen(false)
    setSearchQuery('')
  }, [searchQueryFromUrl])

  React.useEffect(() => {
    if (!searchOpen) return

    const timeoutId = window.setTimeout(
      () => updateSearchQueryInUrl(searchQuery),
      docsSearchQueryUrlSyncDelayMs,
    )
    return () => window.clearTimeout(timeoutId)
  }, [searchOpen, searchQuery, updateSearchQueryInUrl])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === 'k'
      ) {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement)
        )
          return

        event.preventDefault()
        restoreSearchTriggerFocusRef.current = false
        setSearchOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Skip />

      <nav className="bg-bg1 border-gray-a3 fixed inset-x-0 top-0 z-50 h-17 border-b">
        <div className="mx-auto flex h-full w-full max-w-[90rem] items-center ps-5 pe-3 md:ps-8 md:pe-6">
          <Nav.Logo to="/docs" />
          <DocsTopLinks />
          <Nav.Group>
            <SearchTrigger
              onClick={() => {
                restoreSearchTriggerFocusRef.current = true
                setSearchOpen(true)
              }}
              triggerRef={searchTriggerRef}
            />
            <div className="hidden items-center gap-1.5 md:flex">
              <a
                aria-label="GitHub"
                className="text-gray8 hover:text-gray10 p-1.5"
                href="https://github.com/wevm/curl.md"
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconOcticonMarkGithub16 className="size-[1.125rem]" />
              </a>
              <a
                aria-label="X"
                className="text-gray8 hover:text-gray10 me-2 p-1.5"
                href="https://x.com/wevm_dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                <IconSimpleIconsX className="size-4.5" />
              </a>
              {login ? (
                <Link
                  className="bg-gray10 text-bg1 px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
                  params={{ login }}
                  to="/$login"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  className="bg-gray10 text-bg1 px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
                  search={{ next }}
                  to="/login"
                >
                  Sign in
                </Link>
              )}
            </div>
            <button
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              className="hover:bg-gray-a2 p-1.5 md:hidden"
              onClick={() => setOpen((o) => !o)}
              type="button"
            >
              {open ? (
                <IconOcticonX16 className="size-4" />
              ) : (
                <IconOcticonThreeBars16 className="size-4" />
              )}
            </button>
          </Nav.Group>
        </div>
      </nav>

      <div className="mt-17 flex flex-1 justify-center">
        <div className="flex w-full max-w-[90rem] md:gap-12">
          <aside
            className="bg-bg1 border-gray-a3 fixed inset-x-0 top-17 bottom-0 z-40 hidden w-full border-e data-[open]:block md:static md:block md:w-64 md:shrink-0"
            data-open={open ? '' : undefined}
          >
            <div className="h-full overflow-y-auto py-6 ps-6 pe-6 md:sticky md:top-17 md:h-[calc(100dvh-4.25rem)]">
              <div className="flex min-h-full flex-col">
                <SidebarNav items={sidebar} onNavigate={() => setOpen(false)} />

                <div className="border-gray-a3 mt-6 border-t pt-4 md:hidden">
                  <MobileTopLinks onNavigate={() => setOpen(false)} />
                </div>

                <div className="mt-auto pt-4">
                  <div className="border-gray-a3 border-t pt-4 md:hidden">
                    <div className="flex items-center gap-3">
                      <div className="min-w-28 shrink-0">
                        <ThemeToggle />
                      </div>

                      <div className="ms-auto flex min-w-0 items-center gap-1.5">
                        <a
                          aria-label="GitHub"
                          className="text-gray8 hover:text-gray10 p-1.5"
                          href="https://github.com/wevm/curl.md"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <IconOcticonMarkGithub16 className="size-[1.125rem]" />
                        </a>
                        <a
                          aria-label="X"
                          className="text-gray8 hover:text-gray10 me-2 p-1.5"
                          href="https://x.com/wevm_dev"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <IconSimpleIconsX className="size-4.5" />
                        </a>
                        {login ? (
                          <Link
                            className="bg-gray10 text-bg1 px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
                            onClick={() => setOpen(false)}
                            params={{ login }}
                            to="/$login"
                          >
                            Dashboard
                          </Link>
                        ) : (
                          <Link
                            className="bg-gray10 text-bg1 px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
                            onClick={() => setOpen(false)}
                            search={{ next }}
                            to="/login"
                          >
                            Sign in
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1" id={Nav.skipId}>
            <Outlet />
          </main>
        </div>
      </div>

      <Dialog.Root
        open={searchOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setSearchOpen(true)
            return
          }

          closeSearch()
        }}
      >
        <Dialog.Portal>
          <Dialog.Popup className="mt-[0.75rem] mb-[0.25rem] max-h-[calc(100dvh-1rem)] min-h-0 max-w-[min(42rem,calc(100vw-1rem))] gap-0 overflow-hidden border-0 p-4 md:p-5">
            <DocsSearchDialog
              onClear={() => setSearchQuery('')}
              onClose={() => closeSearch()}
              onNavigate={() => closeSearch({ restoreTriggerFocus: false, syncQueryToUrl: false })}
              onQueryChange={setSearchQuery}
              onSelectResult={saveRecentSearchResult}
              query={searchQuery}
              recentResults={recentSearchResults ?? []}
              results={searchResults}
              showDetails={searchShowDetails}
              toggleDetails={() => setSearchShowDetails((current) => !current)}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function MobileTopLinks(props: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      {navbarLinks.map((link) => (
        <NavbarLinkItem
          className="text-gray8 hover:text-gray10 hover:bg-gray-a2 block px-2 py-1.5 text-sm"
          key={link.label}
          link={link}
          onClick={props.onNavigate}
        />
      ))}
    </div>
  )
}

function DocsTopLinks() {
  return (
    <div className="ms-10 hidden items-center gap-0.5 md:flex">
      {navbarLinks.map((link) => (
        <NavbarLinkItem
          className="text-gray8 hover:text-gray10 px-2 py-1.5 text-sm"
          key={link.label}
          link={link}
        />
      ))}
    </div>
  )
}

function ThemeToggle() {
  const { mounted, resolvedTheme, setTheme, theme } = useTheme()
  const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[0]!

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className="text-gray8 hover:text-gray10 hover:bg-gray-a2 data-[popup-open]:bg-gray-a2 data-[popup-open]:text-gray10 flex w-full items-center gap-2 px-3 py-2 text-sm outline-none md:text-xs">
        {getThemeIcon(activeTheme.value, resolvedTheme, mounted)}
        <span className="flex-1 text-left">{activeTheme.label}</span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner align="start" className="z-60 min-w-[var(--anchor-width)]" sideOffset={8}>
          <Menu.Popup className="bg-bg1 border-gray-a3 w-full border p-1 shadow-2xl outline-none">
            <Menu.RadioGroup onValueChange={(value) => setTheme(value as Theme)} value={theme}>
              {themeOptions.map((option) => (
                <Menu.RadioItem
                  className="text-gray8 data-[checked]:text-gray10 data-[highlighted]:bg-gray-a2 data-[highlighted]:text-gray10 flex items-center gap-2 px-3 py-2 text-xs outline-none"
                  closeOnClick
                  key={option.value}
                  value={option.value}
                >
                  <span className="flex-1">{option.label}</span>
                  <Menu.RadioItemIndicator className="text-blue9">
                    <IconOcticonCheck16 className="size-3.5" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

const themeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
] satisfies Array<{ label: string; value: Theme }>

function getThemeIcon(theme: Theme, resolvedTheme: Exclude<Theme, 'system'>, mounted: boolean) {
  const iconTheme = getThemeIconTheme(theme, resolvedTheme, mounted)

  if (iconTheme === 'system') return <IconLucideMonitor className="size-3.5" />

  if (iconTheme === 'light') return <IconMaterialSymbolsLightMode className="size-3.5" />
  return <IconMaterialSymbolsDarkMode className="size-3.5" />
}

function SidebarNav(props: { items: Array<SidebarItem>; onNavigate: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {props.items.map((item) => (
        <SidebarNavItem item={item} key={item.label} onNavigate={props.onNavigate} />
      ))}
    </ul>
  )
}

function SidebarNavItem(props: { item: SidebarItem; onNavigate: () => void }) {
  const { item, onNavigate } = props

  if (item.type === 'group')
    return (
      <li className="mt-6 first:mt-0">
        <span className="text-gray10 block px-2 text-sm font-medium">
          {formatSidebarGroupLabel(item.label)}
        </span>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {item.items.map((child) => (
            <SidebarNavItem item={child} key={child.label} onNavigate={onNavigate} />
          ))}
        </ul>
      </li>
    )

  const to = `/docs${item.path}`
  return (
    <li>
      <Link
        activeOptions={{ exact: true }}
        activeProps={{ className: 'text-gray10 bg-gray-a2' }}
        className="text-gray8 hover:text-gray10 hover:bg-gray-a2 block px-2 py-1.5 text-sm"
        onClick={onNavigate}
        to={to}
      >
        {item.label}
      </Link>
    </li>
  )
}

function formatSidebarGroupLabel(label: string) {
  return label.charAt(0) + label.slice(1).toLowerCase()
}

function SearchTrigger(props: {
  onClick: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      aria-label="Search"
      className="bg-bg2 text-gray8 hover:text-gray10 hover:bg-gray-a2 group me-2 flex h-8 items-center gap-2 ps-2.5 pe-1 text-sm"
      onClick={props.onClick}
      ref={props.triggerRef}
      type="button"
    >
      <IconOcticonSearch16 aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Search</span>
      <span aria-hidden="true" className="hidden sm:inline-flex">
        <kbd className="border-gray-a3 text-gray8 inline-flex h-6 items-center justify-center border bg-transparent px-1.5 font-sans leading-none select-none">
          <span className="flex items-center gap-1">
            <span className="text-[15px] leading-none">⌘</span>
            <span className="text-[14px] leading-none">K</span>
          </span>
        </kbd>
      </span>
    </button>
  )
}

function NavbarLinkItem(props: { className: string; link: NavbarLink; onClick?: () => void }) {
  const { className, link, onClick } = props

  return (
    <Link
      activeOptions={{ exact: true }}
      activeProps={{ 'data-active': '' }}
      className={className}
      onClick={onClick}
      {...('hash' in link ? { hash: link.hash } : {})}
      {...('params' in link ? { params: link.params } : {})}
      to={link.to}
    >
      {link.label}
    </Link>
  )
}

function DocsSearchDialog(props: {
  onClear: () => void
  onClose: () => void
  onNavigate: () => void
  onQueryChange: (value: string) => void
  onSelectResult: (result: DocSearchResult) => void
  query: string
  recentResults: Array<DocSearchResult>
  results: Array<DocSearchResult>
  showDetails: boolean
  toggleDetails: () => void
}) {
  const navigate = useNavigate()
  const hasSearchQuery = props.query.trim().length > 0
  const showingRecentResults = !hasSearchQuery && props.recentResults.length > 0
  const displayedResults = hasSearchQuery ? props.results : props.recentResults
  const comboboxOpen = hasSearchQuery || props.recentResults.length > 0
  const navigateToResult = React.useCallback(
    (result: DocSearchResult) => {
      props.onSelectResult(result)
      props.onNavigate()

      if (result.path)
        return navigate({
          params: { _splat: result.path },
          search: (search) => ({ ...search, q: undefined }),
          ...(result.hash ? { hash: result.hash } : {}),
          to: '/docs/$',
        })

      return navigate({
        search: (search) => ({ ...search, q: undefined }),
        ...(result.hash ? { hash: result.hash } : {}),
        to: '/docs',
      })
    },
    [navigate, props],
  )

  return (
    <Combobox.Root
      autoHighlight
      filter={null}
      highlightItemOnHover={false}
      inline
      inputValue={props.query}
      itemToStringLabel={getSearchResultLabel}
      items={displayedResults}
      onInputValueChange={props.onQueryChange}
      onValueChange={(value) => {
        if (value) void navigateToResult(value)
      }}
      open={comboboxOpen}
    >
      <Dialog.Title className="sr-only">Search docs</Dialog.Title>
      <label className="sr-only" htmlFor="docs-search-dialog">
        Search docs
      </label>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <button aria-label="Close search" className="sr-only" onClick={props.onClose} type="button">
          Close search
        </button>

        <div className="border-gray-a3 bg-bg2 flex items-center gap-1.5 border p-4">
          <span aria-hidden="true" className="text-gray8 flex w-5 shrink-0 items-center">
            <IconOcticonSearch16 className="size-4" />
          </span>
          <Combobox.Input
            autoFocus
            autoComplete="off"
            className="placeholder:text-gray8 min-w-0 flex-1 bg-transparent text-sm leading-none font-medium"
            id="docs-search-dialog"
            placeholder="Search documentation"
          />

          <div className="ms-auto flex items-center gap-2">
            {props.query ? (
              <button
                aria-label="Clear docs search"
                className="text-gray8 hover:text-gray10 hover:bg-gray-a2 p-1"
                onClick={props.onClear}
                type="button"
              >
                <IconLucideDelete aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            <button
              aria-label={props.showDetails ? 'Hide body previews' : 'Show body previews'}
              aria-pressed={props.showDetails}
              className="text-gray8 hover:text-gray10 hover:bg-gray-a2 data-[active]:bg-gray-a2 data-[active]:text-gray10 p-1"
              data-active={props.showDetails ? '' : undefined}
              onClick={props.toggleDetails}
              type="button"
            >
              <IconLucideListTree aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>

        {displayedResults.length ? (
          <>
            {showingRecentResults ? (
              <p className="text-gray8 mt-3 px-1 text-xs font-medium">Recents</p>
            ) : null}
            <Combobox.List
              className={`${showingRecentResults ? 'mt-2' : 'mt-3'} flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto data-[details]:gap-3`}
              data-details={props.showDetails ? '' : undefined}
            >
              {(result, index) => (
                <Combobox.Item
                  className="docs-search-result border-gray-a3 bg-gray-a1/30 text-gray8 data-[highlighted]:border-blue6 data-[highlighted]:text-gray10 block cursor-default border p-4 outline-none"
                  data-details={props.showDetails ? '' : undefined}
                  index={index}
                  key={getSearchResultId(result)}
                  value={result}
                >
                  <SearchResultContent result={result} showDetails={props.showDetails} />
                </Combobox.Item>
              )}
            </Combobox.List>
          </>
        ) : hasSearchQuery ? (
          <p className="text-gray8 mt-3 px-2 py-2 text-sm">No results for “{props.query.trim()}”</p>
        ) : null}

        <div className="text-gray8 mt-3 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <SearchKeyboardHint label="to navigate">
            <SearchKeycap>↑</SearchKeycap>
            <SearchKeycap>↓</SearchKeycap>
          </SearchKeyboardHint>

          <SearchKeyboardHint label="to select">
            <SearchKeycap>Enter</SearchKeycap>
          </SearchKeyboardHint>

          <SearchKeyboardHint label="to close">
            <SearchKeycap>Esc</SearchKeycap>
          </SearchKeyboardHint>
        </div>

        <Combobox.Status className="sr-only" />
      </div>
    </Combobox.Root>
  )
}

function SearchKeyboardHint(props: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5">{props.children}</span>
      <span>{props.label}</span>
    </div>
  )
}

function SearchKeycap(props: { children: React.ReactNode }) {
  return (
    <kbd className="border-gray-a3 text-gray9 inline-flex min-h-6 min-w-6 items-center justify-center border px-1.5 text-xs leading-none">
      {props.children}
    </kbd>
  )
}

function SearchResultContent(props: { result: DocSearchResult; showDetails: boolean }) {
  const subtitle = props.showDetails
    ? (props.result.snippet ?? getSearchResultPath(props.result))
    : undefined
  const isPageResult = !props.result.sectionPath?.length

  return (
    <>
      <p className="text-gray10 flex items-center gap-1.5 truncate text-sm font-medium">
        <span aria-hidden="true" className="text-gray8 flex w-5 shrink-0 items-center">
          {isPageResult ? (
            <IconOcticonFile className="size-4" />
          ) : (
            <IconOcticonHash16 className="size-4" />
          )}
        </span>
        <span className="truncate">
          <SearchResultHeading result={props.result} />
        </span>
      </p>
      {subtitle ? (
        <div className="mt-1.5 max-h-11 overflow-hidden text-sm">
          <SearchResultSnippet markdown={subtitle} />
        </div>
      ) : null}
    </>
  )
}

function SearchResultSnippet(props: { markdown: string }) {
  const snippet = normalizeSearchResultSnippet(props.markdown)

  if (snippet.kind === 'unordered-list')
    return (
      <ul className="[&>li]:before:text-gray9 list-none ps-0 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))] [&>li]:relative [&>li]:ps-4 [&>li]:before:absolute [&>li]:before:start-0 [&>li]:before:top-0 [&>li]:before:content-['-']">
        <li className="leading-relaxed">{renderSearchResultSnippetInline(snippet.value)}</li>
      </ul>
    )

  if (snippet.kind === 'ordered-list')
    return (
      <ol
        className="list-decimal ps-5 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]"
        start={snippet.start}
      >
        <li className="leading-relaxed">{renderSearchResultSnippetInline(snippet.value)}</li>
      </ol>
    )

  return (
    <p className="leading-relaxed break-words text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]">
      {renderSearchResultSnippetInline(snippet.value)}
    </p>
  )
}

function SearchResultHeading(props: { result: DocSearchResult }) {
  const segments = getSearchResultHeadingSegments(props.result)

  return segments.map((segment, index) => (
    <React.Fragment key={`${segment}-${index}`}>
      {index > 0 ? (
        <IconOcticonChevronRight16
          aria-hidden="true"
          className="text-gray8 relative -top-px mx-1.5 inline size-4"
        />
      ) : null}
      <span>{segment}</span>
    </React.Fragment>
  ))
}

function getSearchResultPath(result: DocSearchResult) {
  const pathname = result.path ? `/docs/${result.path}` : '/docs'
  return result.hash ? `${pathname}#${result.hash}` : pathname
}

function getSearchResultId(result: Pick<DocSearchResult, 'hash' | 'path'>) {
  return `${result.path}#${result.hash ?? ''}`
}

function getSearchResultLabel(result: DocSearchResult) {
  return getSearchResultHeading(result)
}

function getSearchResultHeading(result: DocSearchResult) {
  return getSearchResultHeadingSegments(result).join(' > ')
}

function getSearchResultHeadingSegments(result: DocSearchResult) {
  if (!result.sectionPath?.length) return [result.title]
  if (result.sectionPath[0] === result.title) return result.sectionPath
  return [result.title, ...result.sectionPath]
}

function normalizeSearchResultSnippet(markdown: string) {
  let value = markdown
    .replace(/```[a-z0-9_-]*\s*/giu, '')
    .replace(/```/g, '')
    .replace(/^>\s+/u, '')
    .trim()

  const listMatch = /^(?<marker>(?:[-*+]|\d+\.))\s+(?<body>.+)$/u.exec(value)
  if (!listMatch?.groups?.body) return { kind: 'paragraph' as const, value }

  const marker = listMatch.groups.marker ?? ''
  value = listMatch.groups.body.trim()
  if (/^\d+\.$/u.test(marker))
    return {
      kind: 'ordered-list' as const,
      start: Number.parseInt(marker, 10),
      value,
    }

  return { kind: 'unordered-list' as const, value }
}

function renderSearchResultSnippetInline(markdown: string) {
  const nodes: Array<React.ReactNode> = []
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/gu
  let lastIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(markdown.slice(lastIndex, index))

    if (match[1]) {
      nodes.push(
        <span className="text-blue9 underline-offset-2 hover:underline" key={`${index}-link`}>
          {match[1]}
        </span>,
      )
    } else if (match[3]) {
      nodes.push(
        <code
          className="border-gray-a3 bg-gray-a2 rounded-[2px] border px-1 py-px text-[0.875em]"
          key={`${index}-code`}
        >
          {match[3]}
        </code>,
      )
    } else if (match[4]) {
      nodes.push(
        <strong className="font-medium text-current" key={`${index}-strong`}>
          {match[4]}
        </strong>,
      )
    } else if (match[5] || match[6]) {
      nodes.push(
        <em className="italic" key={`${index}-em`}>
          {match[5] ?? match[6]}
        </em>,
      )
    }

    lastIndex = index + match[0].length
  }

  if (lastIndex < markdown.length) nodes.push(markdown.slice(lastIndex))
  return nodes
}

function getNextRecentDocsSearchResults(
  results: Array<DocSearchResult>,
  selectedResult: DocSearchResult,
) {
  const selectedResultId = getSearchResultId(selectedResult)
  return [
    selectedResult,
    ...results.filter((result) => getSearchResultId(result) !== selectedResultId),
  ].slice(0, recentDocsSearchResultsLimit)
}

function readRecentDocsSearchResults(): Array<DocSearchResult> {
  const storedResults = window.localStorage.getItem(recentDocsSearchResultsStorageKey)
  if (!storedResults) return []

  try {
    const parsedResults = JSON.parse(storedResults)
    return Array.isArray(parsedResults) ? parsedResults : []
  } catch {
    return []
  }
}

function readDocsSearchShowDetails() {
  const storedValue = window.localStorage.getItem(docsSearchShowDetailsStorageKey)
  if (!storedValue) return false

  try {
    return JSON.parse(storedValue) === true
  } catch {
    return false
  }
}

function normalizeDocsSearchQuery(query: string | undefined) {
  return query?.trim() ?? ''
}
