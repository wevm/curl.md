import { Combobox } from '@base-ui/react/combobox'
import { Menu } from '@base-ui/react/menu'
import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { Dialog } from '#components/Dialog.tsx'
import { Nav } from '#components/Nav.tsx'
import { config, type Config } from '#docs/_config.ts'
import { sidebar, type SidebarItem } from '#docs/_sidebar.ts'
import { type Theme, useTheme } from '#hooks/useTheme.ts'
import { getSessionLogin } from '#server/session.ts'
import { findDoc, searchDocs } from './-catalog.ts'
import { DocSearchPreview } from './-render.tsx'
import { validateSearch } from './-route.tsx'
import type { DocSearchResult } from './-search.ts'
import { docSearchHighlightClassName, getDocSearchHighlightRanges, type Doc } from './-utils.ts'
import stylesCssHref from './styles.css?url'

export const Route = createFileRoute('/docs')({
  head: () => ({
    links: [{ href: stylesCssHref, rel: 'stylesheet' }],
  }),
  async loader({ location }) {
    return {
      login: await getSessionLogin(),
      next: location.publicHref ?? location.pathname,
    }
  },
  validateSearch,
  component: Component,
})

const docsSearchQueryUrlSyncDelayMs = 400 // 0.4 seconds
const recentDocsSearchResultsLimit = 5
const recentDocsSearchResultsStorageKey = 'docs-recent-search-results'
const docsSearchShowDetailsStorageKey = 'docs-search-show-details'
const emptyCachedPreviewIds = new Set<string>()

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
                href={config.repoBaseUrl}
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
                  className="bg-gray10 text-bg1 px-3 py-1.5 text-sm hover:opacity-90"
                  params={{ login }}
                  to="/$login"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  className="bg-gray10 text-bg1 px-3 py-1.5 text-sm hover:opacity-90"
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
            <div className="h-full overflow-y-auto py-6 ps-5 pe-3 md:sticky md:top-17 md:h-[calc(100dvh-4.25rem)] md:ps-6 md:pe-6">
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
                          href={config.repoBaseUrl}
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
                            className="bg-gray10 text-bg1 px-3 py-1.5 text-sm hover:opacity-90"
                            onClick={() => setOpen(false)}
                            params={{ login }}
                            to="/$login"
                          >
                            Dashboard
                          </Link>
                        ) : (
                          <Link
                            className="bg-gray10 text-bg1 px-3 py-1.5 text-sm hover:opacity-90"
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
          <Dialog.Popup className="mt-[0.75rem] mb-[0.25rem] max-h-[calc(100dvh-1rem)] min-h-0 max-w-[min(42rem,calc(100vw-1rem))] gap-0 overflow-hidden border-0 p-3 md:p-5">
            <DocsSearchDialog
              onClear={() => setSearchQuery('')}
              onClearRecents={() => setRecentSearchResults([])}
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
      {config.navbarLinks.map((link) => (
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
    <div className="ms-10 mt-0.5 hidden items-center gap-0.5 md:flex">
      {config.navbarLinks.map((link) => (
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
  const iconTheme = theme === 'system' && mounted ? resolvedTheme : theme
  if (iconTheme === 'system') return <IconLucideMonitor className="size-3.5" />
  if (iconTheme === 'light') return <IconMaterialSymbolsWbSunny className="size-3.5" />
  return <IconMaterialSymbolsDarkMode className="size-3.5" />
}

function SidebarNav(props: { items: Array<SidebarItem>; onNavigate: () => void }) {
  return (
    <ul className="flex list-none flex-col gap-0.5 ps-0">
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
        <span className="text-gray10 block px-2 py-1.5 text-sm font-medium lowercase first-letter:uppercase md:py-0">
          {item.label}
        </span>
        <ul className="mt-1.5 flex list-none flex-col gap-0.5 ps-0">
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

function SearchTrigger(props: {
  onClick: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      aria-label="Search"
      className="hover:bg-gray-a2 group sm:bg-gray-a2 dark:sm:bg-bg2 sm:text-gray8 sm:hover:text-gray10 flex items-center justify-center p-1.5 text-sm sm:me-2 sm:h-8 sm:w-auto sm:justify-start sm:gap-2 sm:p-0 sm:ps-2.5 sm:pe-1"
      onClick={props.onClick}
      ref={props.triggerRef}
      type="button"
    >
      <IconOcticonSearch16 aria-hidden="true" className="size-4 shrink-0 sm:size-3.5" />
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

function NavbarLinkItem(props: {
  className: string
  link: Config['navbarLinks'][number]
  onClick?: () => void
}) {
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
  onClearRecents: () => void
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
  const previewCacheScopeKey = `${props.query.trim()}::${displayedResults.map((result) => getSearchResultId(result)).join('|')}`
  const [cachedPreviewState, setCachedPreviewState] = React.useState<{
    ids: Set<string>
    key: string
  }>({ ids: new Set(), key: previewCacheScopeKey })
  const [highlightedResultId, setHighlightedResultId] = React.useState<string | undefined>(
    undefined,
  )
  const resultsListRef = React.useRef<HTMLDivElement>(null)
  const resultItemElementsRef = React.useRef(new Map<string, HTMLDivElement>())
  const navigateToResult = React.useCallback(
    (result: DocSearchResult) => {
      props.onSelectResult(result)
      props.onNavigate()

      const hash = result.kind === 'section' ? result.hash : undefined

      if (result.path)
        return navigate({
          params: { _splat: result.path },
          search: (search) => ({ ...search, q: undefined }),
          ...(hash ? { hash } : {}),
          to: '/docs/$',
        })

      return navigate({
        search: (search) => ({ ...search, q: undefined }),
        ...(hash ? { hash } : {}),
        to: '/docs',
      })
    },
    [navigate, props],
  )

  React.useEffect(() => {
    setCachedPreviewState((current) => {
      if (current.key === previewCacheScopeKey) return current
      return { ids: new Set(), key: previewCacheScopeKey }
    })
  }, [previewCacheScopeKey])

  const cachePreview = React.useCallback(
    (resultId: string) => {
      setCachedPreviewState((current) => {
        if (current.key !== previewCacheScopeKey)
          return { ids: new Set([resultId]), key: previewCacheScopeKey }

        if (current.ids.has(resultId)) return current

        const ids = new Set(current.ids)
        ids.add(resultId)
        return { ids, key: current.key }
      })
    },
    [previewCacheScopeKey],
  )

  const cachedPreviewIds =
    cachedPreviewState.key === previewCacheScopeKey ? cachedPreviewState.ids : emptyCachedPreviewIds

  const scrollResultIntoView = React.useCallback((resultId: string | undefined) => {
    if (!resultId) return

    requestAnimationFrame(() => {
      const list = resultsListRef.current
      const element = resultItemElementsRef.current.get(resultId)
      if (!list || !element) return

      const listRect = list.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      if (elementRect.top < listRect.top || elementRect.bottom > listRect.bottom)
        element.scrollIntoView({ block: 'nearest' })
    })
  }, [])

  const scrollHighlightedResultIntoView = React.useCallback(
    (result: DocSearchResult | undefined) => {
      const resultId = result ? getSearchResultId(result) : undefined
      setHighlightedResultId(resultId)
      scrollResultIntoView(resultId)
    },
    [scrollResultIntoView],
  )

  React.useEffect(() => {
    if (!highlightedResultId) return

    const element = resultItemElementsRef.current.get(highlightedResultId)
    if (!element) return

    const resizeObserver = new ResizeObserver(() => scrollResultIntoView(highlightedResultId))
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [highlightedResultId, scrollResultIntoView])

  return (
    <Combobox.Root
      autoHighlight
      filter={null}
      highlightItemOnHover={false}
      inline
      inputValue={props.query}
      itemToStringLabel={(result) => getSearchResultHeadingSegments(result).join(' > ')}
      items={displayedResults}
      onItemHighlighted={scrollHighlightedResultIntoView}
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
            <button
              aria-label="Close search"
              className="text-gray8 hover:text-gray10 hover:bg-gray-a2 p-1 md:hidden"
              onClick={props.onClose}
              type="button"
            >
              <IconOcticonX16 aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>

        {displayedResults.length ? (
          <>
            {showingRecentResults ? (
              <div className="mt-3 flex items-center justify-between gap-3 px-1">
                <p className="text-gray8 text-xs font-medium">Recents</p>
                <button
                  className="text-gray8 hover:text-gray10 hover:bg-gray-a2 px-1 py-0.5 text-xs"
                  onClick={props.onClearRecents}
                  type="button"
                >
                  Clear
                </button>
              </div>
            ) : null}
            <Combobox.List
              className={`${showingRecentResults ? 'mt-2' : 'mt-3'} flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto data-[details]:gap-3`}
              data-details={props.showDetails ? '' : undefined}
              ref={resultsListRef}
            >
              {(result, index) => (
                <Combobox.Item
                  className="border-gray-a3 bg-gray-a1/30 text-gray8 hover:bg-gray-a2 data-[highlighted]:border-blue6 data-[highlighted]:text-gray10 block cursor-default border p-4 outline-none"
                  data-details={props.showDetails ? '' : undefined}
                  index={index}
                  key={getSearchResultId(result)}
                  ref={(element) => {
                    const resultId = getSearchResultId(result)
                    if (!element) {
                      resultItemElementsRef.current.delete(resultId)
                      return
                    }

                    resultItemElementsRef.current.set(resultId, element)
                  }}
                  value={result}
                >
                  <SearchResultContent
                    cachedPreviewIds={cachedPreviewIds}
                    onCachePreview={cachePreview}
                    result={result}
                    showDetails={props.showDetails}
                  />
                </Combobox.Item>
              )}
            </Combobox.List>
          </>
        ) : hasSearchQuery ? (
          <p className="text-gray8 mt-3 px-2 py-2 text-sm">No results for “{props.query.trim()}”</p>
        ) : null}

        <div className="text-gray8 mt-3 hidden shrink-0 flex-wrap items-center gap-x-6 gap-y-3 text-xs md:flex">
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

function SearchResultContent(props: {
  cachedPreviewIds: Set<string>
  onCachePreview: (resultId: string) => void
  result: DocSearchResult
  showDetails: boolean
}) {
  const previewFallback = props.result.snippet ?? getSearchResultPath(props.result)
  const resultId = getSearchResultId(props.result)
  const isPageResult = props.result.kind === 'page'
  const docPreview = props.showDetails ? findDoc(props.result.path) : undefined

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
      {props.showDetails && docPreview ? (
        <SearchResultPreview
          cacheId={resultId}
          cached={props.cachedPreviewIds.has(resultId)}
          doc={docPreview}
          fallback={<SearchResultSnippet markdown={previewFallback} terms={props.result.terms} />}
          onCache={props.onCachePreview}
          {...(props.result.kind === 'section' ? { hash: props.result.hash } : {})}
          terms={props.result.terms}
        />
      ) : props.showDetails ? (
        <div className="mt-1.5 max-h-11 overflow-hidden text-[0.8125rem]">
          <SearchResultSnippet markdown={previewFallback} terms={props.result.terms} />
        </div>
      ) : null}
    </>
  )
}

function SearchResultPreview(props: {
  cacheId: string
  cached: boolean
  doc: Pick<Doc, 'Component' | 'path'>
  fallback: React.ReactNode
  hash?: string
  onCache: (resultId: string) => void
  terms?: Array<string> | undefined
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting) {
          setIsVisible(true)
          props.onCache(props.cacheId)
          return
        }

        if (!props.cached) setIsVisible(false)
      },
      { rootMargin: '160px 0px' },
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [props.cacheId, props.cached, props.onCache])

  return (
    <div className="mt-2 text-[0.8125rem]" data-search-rich-preview="" ref={containerRef}>
      {props.cached || isVisible ? (
        <DocSearchPreview doc={props.doc} hash={props.hash} terms={props.terms} />
      ) : (
        <div className="max-h-11 overflow-hidden">{props.fallback}</div>
      )}
    </div>
  )
}

function SearchResultSnippet(props: { markdown: string; terms?: Array<string> | undefined }) {
  const snippet = normalizeSearchResultSnippet(props.markdown)

  if (snippet.kind === 'unordered-list')
    return (
      <ul className="[&>li]:before:text-gray9 list-none ps-0 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))] [&>li]:relative [&>li]:ps-4 [&>li]:before:absolute [&>li]:before:start-0 [&>li]:before:top-0 [&>li]:before:content-['-']">
        <li className="leading-relaxed">
          {renderSearchResultSnippetInline(snippet.value, props.terms)}
        </li>
      </ul>
    )

  if (snippet.kind === 'ordered-list')
    return (
      <ol
        className="list-decimal ps-5 text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]"
        start={snippet.start}
      >
        <li className="leading-relaxed">
          {renderSearchResultSnippetInline(snippet.value, props.terms)}
        </li>
      </ol>
    )

  return (
    <p className="leading-relaxed break-words text-[color-mix(in_oklab,var(--color-gray10)_25%,var(--color-gray9))]">
      {renderSearchResultSnippetInline(snippet.value, props.terms)}
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
      <span>
        {renderHighlightedSearchResultText(segment, props.result.terms, `${segment}-${index}`)}
      </span>
    </React.Fragment>
  ))
}

function getSearchResultPath(result: DocSearchResult) {
  const pathname = result.path ? `/docs/${result.path}` : '/docs'
  return result.kind === 'section' ? `${pathname}#${result.hash}` : pathname
}

function getSearchResultId(result: DocSearchResult) {
  return `${result.path}#${result.kind === 'section' ? result.hash : ''}`
}

function getSearchResultHeadingSegments(result: DocSearchResult) {
  if (result.kind === 'page') return [result.title]
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

function renderSearchResultSnippetInline(markdown: string, terms: Array<string> | undefined) {
  const nodes: Array<React.ReactNode> = []
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/gu
  let lastIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > lastIndex)
      nodes.push(
        ...renderHighlightedSearchResultText(
          markdown.slice(lastIndex, index),
          terms,
          `${index}-text`,
        ),
      )

    if (match[1]) {
      nodes.push(
        <span className="text-blue9 underline-offset-2 hover:underline" key={`${index}-link`}>
          {renderHighlightedSearchResultText(match[1], terms, `${index}-link`)}
        </span>,
      )
    } else if (match[3]) {
      nodes.push(
        <code
          className="border-gray-a3 bg-gray-a2 rounded-[2px] border px-1 py-px text-[0.875em]"
          key={`${index}-code`}
        >
          {renderHighlightedSearchResultText(match[3], terms, `${index}-code`)}
        </code>,
      )
    } else if (match[4]) {
      nodes.push(
        <strong className="font-medium text-current" key={`${index}-strong`}>
          {renderHighlightedSearchResultText(match[4], terms, `${index}-strong`)}
        </strong>,
      )
    } else if (match[5] || match[6]) {
      nodes.push(
        <em className="italic" key={`${index}-em`}>
          {renderHighlightedSearchResultText(match[5] ?? match[6] ?? '', terms, `${index}-em`)}
        </em>,
      )
    }

    lastIndex = index + match[0].length
  }

  if (lastIndex < markdown.length)
    nodes.push(
      ...renderHighlightedSearchResultText(markdown.slice(lastIndex), terms, `${lastIndex}-tail`),
    )

  return nodes
}

function renderHighlightedSearchResultText(
  value: string,
  terms: Array<string> | undefined,
  keyPrefix: string,
) {
  if (!value) return []

  const ranges = getDocSearchHighlightRanges(value, terms)
  if (!ranges.length) return [value]

  const nodes: Array<React.ReactNode> = []
  let lastIndex = 0

  for (const [index, range] of ranges.entries()) {
    const startIndex = range.start
    if (startIndex > lastIndex) nodes.push(value.slice(lastIndex, startIndex))

    nodes.push(
      <mark className={docSearchHighlightClassName} key={`${keyPrefix}-mark-${index}`}>
        {value.slice(range.start, range.end)}
      </mark>,
    )
    lastIndex = range.end
  }

  if (!nodes.length) return [value]
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))
  return nodes
}

function getNextRecentDocsSearchResults(
  results: Array<DocSearchResult>,
  selectedResult: DocSearchResult,
) {
  // Recents should not carry stale highlight terms from the previous query.
  const nextResult = selectedResult.terms?.length
    ? withoutDocSearchResultTerms(selectedResult)
    : selectedResult
  const selectedResultId = getSearchResultId(nextResult)
  return [
    nextResult,
    ...results.filter((result) => getSearchResultId(result) !== selectedResultId),
  ].slice(0, recentDocsSearchResultsLimit)
}

function readRecentDocsSearchResults(): Array<DocSearchResult> {
  const storedResults = window.localStorage.getItem(recentDocsSearchResultsStorageKey)
  if (!storedResults) return []

  try {
    const parsedResults = JSON.parse(storedResults)
    return Array.isArray(parsedResults)
      ? parsedResults.map((result) => {
          const recentResult = result as DocSearchResult
          // Recents should not carry stale highlight terms from the previous query.
          return recentResult.terms?.length
            ? withoutDocSearchResultTerms(recentResult)
            : recentResult
        })
      : []
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

function withoutDocSearchResultTerms(result: DocSearchResult): DocSearchResult {
  const { terms: _terms, ...resultWithoutTerms } = result
  return resultWithoutTerms
}
