import * as Query from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'
import { useCopyToClipboard } from '#hooks/useCopyToClipboard.ts'
import { attribution } from '#lib/constants.ts'
import { formatCost } from '#lib/format.ts'
import { rpc } from '#lib/rpc.ts'

const searchSchema = z.object({
  anchor: z.string().optional(),
  k: z.string().optional(),
  q: z.string().optional(),
  url: z.string().optional(),
})

export const Route = createFileRoute('/playground')({
  head() {
    const ogImage = rpc.api['og.png'].$url({ query: { page: 'playground' } }).toString()
    return {
      meta: [
        { title: `Playground - ${__HOST__}` },
        { name: 'description', content: 'URL to markdown for agents' },
        { property: 'og:title', content: `${__HOST__}/playground` },
        { property: 'og:description', content: 'URL to markdown for agents' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${__HOST__}/playground` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${__HOST__}/playground` },
        { name: 'twitter:description', content: 'URL to markdown for agents' },
        { name: 'twitter:image', content: ogImage },
      ],
    }
  },
  validateSearch: searchSchema,
  component: Component,
})

function Component() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [url, setUrl] = React.useState(toInputURL(search.url, search.anchor))
  const [objective, setObjective] = React.useState(search.q ?? '')
  const [keywords, setKeywords] = React.useState(search.k ?? '')
  const abortRef = React.useRef<AbortController | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const mutation = Query.useMutation({
    async mutationFn(input: { k?: string | undefined; q?: string | undefined; url: string }) {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const validatedUrl = new URL(
        z.parse(
          z
            .string()
            .transform((arg) => (arg.includes('://') ? arg : `https://${arg}`))
            .pipe(
              z.url({
                hostname: z.regexes.domain,
                normalize: true,
                protocol: /^https?$/,
              }),
            ),
          input.url.trim(),
        ),
      )
      const anchor = validatedUrl.hash.slice(1) || undefined
      const params = new URLSearchParams()
      if (anchor) params.set('anchor', anchor)
      if (input.k?.trim()) params.set('k', input.k.trim())
      if (input.q?.trim()) params.set('q', input.q.trim())
      const query = params.toString()
      const targetSearch = validatedUrl.search ? encodeURIComponent(validatedUrl.search) : ''
      const path = `/${validatedUrl.host}${validatedUrl.pathname}${targetSearch}${query ? `?${query}` : ''}`

      const res = await fetch(path, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      const data: { content: string } | { error: string } = await res.json()
      if ('error' in data) throw new Error(data.error)
      return {
        cached: res.headers.get('x-cache') === 'HIT',
        fetchedUrl: `${__HOST__}${path}`,
        markdown: data.content.replace(attribution.pattern, ''),
        stats: {
          tokensCount: Number(res.headers.get('x-tokens-count') ?? 0),
          tokensSaved: Number(res.headers.get('x-tokens-saved') ?? 0),
        },
      }
    },
  })

  const syncToUrl = React.useCallback(
    (values: { k?: string | undefined; q?: string | undefined; url?: string | undefined }) => {
      navigate({
        to: '/playground',
        search: () => {
          const normalizedURL = normalizeTargetURL(values.url)
          const next = {
            anchor: normalizedURL.anchor,
            k: values.k,
            q: values.q,
            url: normalizedURL.url,
          }
          for (const key of Object.keys(next) as (keyof typeof next)[])
            if (!next[key]) delete next[key]
          return next
        },
        replace: true,
      })
    },
    [navigate],
  )

  // Sync local state to URL
  React.useEffect(() => {
    syncToUrl({ url, q: objective, k: keywords })
  }, [url, objective, keywords, syncToUrl])

  // Auto-submit on load if URL is present
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  React.useEffect(() => {
    const inputURL = toInputURL(search.url, search.anchor)
    if (inputURL.trim()) mutation.mutate({ url: inputURL, q: search.q, k: search.k })
  }, [])

  const setInputs = (values: {
    k?: string | undefined
    q?: string | undefined
    url?: string | undefined
  }) => {
    if (values.url !== undefined) setUrl(values.url)
    if (values.q !== undefined) setObjective(values.q)
    if (values.k !== undefined) setKeywords(values.k)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    mutation.mutate({ url, q: objective, k: keywords })
  }

  const error = (() => {
    const err = mutation.error
    if (!err) return ''
    if (err instanceof DOMException && err.name === 'AbortError') return ''
    if (err instanceof z.ZodError) return 'Invalid URL'
    return err.message || 'Failed to fetch page'
  })()
  const { cached = false, fetchedUrl = '', markdown = '', stats = null } = mutation.data ?? {}
  const hasResult = (markdown || error) && (fetchedUrl || error)

  const examples = [
    {
      k: 'pull_request,pull request',
      q: 'pull request webhook event payload and actions',
      url: 'docs.github.com/en/webhooks/webhook-events-and-payloads',
    },
    {
      k: 'claude code',
      q: 'how do i install for claude code',
      url: 'vercel.com/docs/agent-resources/vercel-mcp',
    },
    {
      k: 'ReadableStream,getReader',
      q: 'streaming response body',
      url: 'developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
    },
    {
      k: 'D1,bindings',
      q: 'how to query D1 from a worker',
      url: 'developers.cloudflare.com/d1/get-started',
    },
    {
      k: 'd1,planetscale',
      q: 'how do i connect to d1 with planetscale',
      url: 'developers.cloudflare.com/workers/databases/connecting-to-databases',
    },
    {
      k: 'streamText,generateText',
      q: 'how to stream text with the ai sdk',
      url: 'ai-sdk.dev/docs/ai-sdk-core/generating-text',
    },
  ]

  return (
    <div className="relative flex min-h-dvh flex-col px-6 pt-6 pb-24 text-lg md:h-dvh md:pb-6">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl grow flex-col gap-4">
        <div className="flex flex-col gap-1">
          <a
            className="text-gray9 hover:text-gray10 dark:text-gray6 w-max hover:underline"
            href="/"
          >
            &larr; Home
          </a>
          <h1 className="mt-4 font-bold">Playground</h1>
          <p className="text-gray9 dark:text-gray6">Try fetching any URL as Markdown</p>
        </div>

        <div className="flex min-h-0 grow flex-col gap-6 md:flex-row">
          <div className="flex w-full flex-col gap-4 md:basis-2/5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex items-center">
                <label className="text-gray9 dark:text-gray6 shrink-0" htmlFor="url">
                  {__HOST__}/
                </label>
                <input
                  ref={inputRef}
                  className="bg-gray-a1 text-gray10 placeholder:text-gray9 dark:placeholder:text-gray6 w-full px-2 py-1"
                  id="url"
                  onBlur={() => {
                    const stripped = url.replace(/^https?:\/\//, '')
                    if (stripped !== url) setUrl(stripped)
                  }}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  type="text"
                  value={url}
                />
              </div>
              <div className="flex items-center">
                <label className="text-gray9 dark:text-gray6 shrink-0" htmlFor="objective">
                  q=
                </label>
                <input
                  className="bg-gray-a1 text-gray10 placeholder:text-gray9 dark:placeholder:text-gray6 w-full px-2 py-1"
                  id="objective"
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="objective (optional)"
                  type="text"
                  value={objective}
                />
              </div>
              <div className="flex items-center">
                <label className="text-gray9 dark:text-gray6 shrink-0" htmlFor="keywords">
                  k=
                </label>
                <input
                  className="bg-gray-a1 text-gray10 placeholder:text-gray9 dark:placeholder:text-gray6 w-full px-2 py-1"
                  id="keywords"
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="keywords (optional)"
                  type="text"
                  value={keywords}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="bg-gray10 text-bg1 not-disabled:hover:bg-gray9 px-3 py-1 disabled:opacity-50"
                  disabled={mutation.isPending || !url.trim()}
                  type="submit"
                >
                  {mutation.isPending ? 'Fetching' : 'Fetch'}
                </button>
                {mutation.isPending && (
                  <button
                    className="text-gray9 hover:text-gray10 dark:text-gray6 px-3 py-1"
                    onClick={() => abortRef.current?.abort()}
                    type="button"
                  >
                    Cancel
                  </button>
                )}
                {hasResult && (
                  <button
                    className="text-gray9 hover:text-gray10 dark:text-gray6 px-3 py-1"
                    onClick={() => {
                      mutation.reset()
                      setInputs({ url: '', q: '', k: '' })
                    }}
                    type="button"
                  >
                    Reset
                  </button>
                )}
              </div>
            </form>

            {!hasResult && (
              <div className="flex flex-col gap-3 md:hidden">
                <p className="text-gray9 dark:text-gray6">
                  Enter a URL and click Fetch, or try an example:
                </p>
                {examples.map((example) => (
                  <button
                    className="bg-gray-a2 text-gray9 not-disabled:hover:bg-gray-a3 dark:text-gray6 p-3 text-start break-all disabled:opacity-50"
                    disabled={mutation.isPending}
                    key={example.url}
                    onClick={() => {
                      setInputs(example)
                      mutation.mutate(example)
                    }}
                    type="button"
                  >
                    <span className="text-gray9 dark:text-gray6">{__HOST__}/</span>
                    <span className="text-gray10">{example.url.split('/')[0]}</span>
                    {example.url.includes('/') && `/${example.url.split('/').slice(1).join('/')}`}
                    {example.q && (
                      <>
                        ?q=
                        <span className="text-gray10">{example.q}</span>
                      </>
                    )}
                    {example.k && (
                      <>
                        &k=
                        <span className="text-gray10">{example.k}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}

            {hasResult && (
              <div className="text-gray9 dark:text-gray6 flex flex-col gap-1">
                <code className="break-all">{fetchedUrl}</code>
                {stats && (
                  <>
                    <span>
                      <span className="text-gray10">
                        {stats.tokensCount.toLocaleString('en-US')}
                      </span>{' '}
                      tokens{cached ? ' (cached)' : ''}
                    </span>
                    {stats.tokensSaved > 0 && (
                      <>
                        <span>
                          <span className="text-green9">
                            {stats.tokensSaved.toLocaleString('en-US')}
                          </span>{' '}
                          tokens saved
                        </span>
                        <span>
                          <span className="text-green9">${formatCost(stats.tokensSaved, 3)}</span>{' '}
                          saved (frontier)
                        </span>
                        <span>
                          <span className="text-green9">${formatCost(stats.tokensSaved, 0.5)}</span>{' '}
                          saved (budget)
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {hasResult && (
              <div className="text-gray9 dark:text-gray6 -mx-6 flex flex-col gap-1 md:hidden">
                {markdown && (
                  <pre className="minimal-scrollbar bg-bg2 text-gray10 px-6 py-4 break-words whitespace-pre-wrap">
                    {markdown}
                  </pre>
                )}
                {error && (
                  <pre className="text-red9 overflow-x-auto whitespace-pre-wrap">{error}</pre>
                )}
              </div>
            )}
          </div>

          <div className="relative hidden max-h-[calc(100dvh-10rem)] min-h-[calc(100dvh-10rem)] w-full min-w-0 flex-col gap-2 md:flex md:basis-3/5">
            {error ? (
              <pre className="text-red9 overflow-x-auto whitespace-pre-wrap [scrollbar-gutter:stable]">
                {error}
              </pre>
            ) : markdown ? (
              <>
                <div className="absolute end-2 top-2 z-10">
                  <CopyButton text={markdown} />
                </div>
                <pre className="minimal-scrollbar bg-bg2 text-gray10 min-h-0 grow overflow-auto p-4 break-words whitespace-pre-wrap [scrollbar-gutter:stable]">
                  {markdown}
                </pre>
              </>
            ) : (
              <div className="bg-bg2 text-gray9 dark:text-gray6 flex min-h-0 grow flex-col gap-4 p-4 [scrollbar-gutter:stable]">
                <p>Enter a URL and click Fetch, or try an example:</p>
                {examples.map((example) => (
                  <button
                    className="bg-gray-a2 text-gray9 not-disabled:hover:bg-gray-a3 dark:text-gray6 p-3 text-start disabled:opacity-50"
                    disabled={mutation.isPending}
                    key={example.url}
                    onClick={() => {
                      setInputs(example)
                      mutation.mutate(example)
                    }}
                    type="button"
                  >
                    <span className="text-gray9 dark:text-gray6">{__HOST__}/</span>
                    <span className="text-gray10">{example.url.split('/')[0]}</span>
                    {example.url.includes('/') && `/${example.url.split('/').slice(1).join('/')}`}
                    {example.q && (
                      <>
                        ?q=
                        <span className="text-gray10">{example.q}</span>
                      </>
                    )}
                    {example.k && (
                      <>
                        &k=
                        <span className="text-gray10">{example.k}</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CopyButton(props: { text: string }) {
  const { text } = props
  const { copied, copy } = useCopyToClipboard()

  return (
    <button
      className="text-gray9 hover:text-gray10 dark:text-gray6 flex items-center gap-1"
      onClick={() => copy(text)}
      type="button"
    >
      {copied ? (
        <>
          <IconOcticonCheck16 /> Copied
        </>
      ) : (
        <>
          <IconOcticonCopy16 /> Copy
        </>
      )}
    </button>
  )
}

function normalizeTargetURL(url: string | undefined) {
  if (!url) return { anchor: undefined, url: undefined }

  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) return { anchor: undefined, url }

  return {
    anchor: url.slice(hashIndex + 1) || undefined,
    url: url.slice(0, hashIndex) || undefined,
  }
}

function toInputURL(url: string | undefined, anchor: string | undefined) {
  if (!url) return ''
  return anchor ? `${url}#${anchor}` : url
}
