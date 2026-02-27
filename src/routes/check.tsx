import * as Query from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'
import { useAnimatedValue } from '#hooks/use-animated-value.ts'
import { rpc } from '#lib/rpc.ts'
import { urlSchema } from '#lib/schemas.ts'
import { computeScore } from '#lib/score.ts'

export const Route = createFileRoute('/check')({
  head: ({ match }) => {
    const checkedUrl = match.search.url
    const ogImage = rpc.api['og.png']
      .$url({ query: { page: 'check', url: checkedUrl } })
      .toString()
    const description = checkedUrl
      ? `Agent Readability Score for ${checkedUrl}`
      : 'Check how well your site converts to Markdown for AI agents'

    return {
      meta: [
        { title: `Agent Readability Score - ${__HOST__}` },
        { name: 'description', content: description },
        { property: 'og:title', content: `${__HOST__}/check` },
        { property: 'og:description', content: description },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${__HOST__}/check` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${__HOST__}/check` },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: ogImage },
      ],
    }
  },
  validateSearch: z.object({ url: z.string().optional() }),
  component: Check,
})

function Check() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [url, setUrl] = React.useState(search.url ?? '')
  const abortRef = React.useRef<AbortController | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const mutation = Query.useMutation({
    mutationFn: async (input: { url: string }) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const validatedUrl = new URL(z.parse(urlSchema, input.url.trim()))
      const path = `/${validatedUrl.host}${validatedUrl.pathname}`

      const res = await fetch(path, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      const data: { content: string } | { error: string } = await res.json()
      if ('error' in data) throw new Error(data.error)

      const markdown = data.content.replace(
        /\n\n---\n\nPowered by \[curl\.md\]\(https:\/\/curl\.md\)$/,
        '',
      )
      const tokensCount = Number(res.headers.get('x-tokens-count') ?? 0)
      const tokensSaved = Number(res.headers.get('x-tokens-saved') ?? 0)
      const rawHtmlLength = (tokensCount + tokensSaved) * 4

      const score = computeScore({
        markdown,
        rawHtmlLength,
        tokensCount,
        tokensSaved,
      })

      return { markdown, score, stats: { tokensCount, tokensSaved } }
    },
  })

  React.useEffect(() => {
    navigate({
      to: '/check',
      search: () => {
        const next: { url?: string } = { url: url || undefined }
        if (!next.url) delete next.url
        return next
      },
      replace: true,
    })
  }, [url, navigate])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  React.useEffect(() => {
    if (search.url?.trim()) mutation.mutate({ url: search.url })
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    mutation.mutate({ url })
  }

  const error = (() => {
    const err = mutation.error
    if (!err) return ''
    if (err instanceof DOMException && err.name === 'AbortError') return ''
    if (err instanceof z.ZodError) return 'Invalid URL'
    return err.message || 'Failed to fetch page'
  })()

  const { markdown = '', score = null, stats = null } = mutation.data ?? {}
  const hasResult = !!(markdown || error)

  return (
    <div className="relative flex min-h-dvh flex-col px-6 pt-6 pb-16 text-lg md:h-dvh md:pb-6">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl grow flex-col gap-4">
        <div className="flex flex-col gap-1">
          <a
            className="w-max text-gray9 hover:text-gray10 hover:underline dark:text-gray6"
            href="/"
          >
            &larr; Home
          </a>
          <h1 className="mt-4 font-bold">Agent Readability Score</h1>
          <p className="text-gray9 dark:text-gray6">
            Check how well your site converts to Markdown for AI agents
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 md:flex-row md:items-center"
        >
          <div className="flex grow flex-col md:flex-row md:items-center">
            <label
              className="shrink-0 text-gray9 dark:text-gray6"
              htmlFor="url"
            >
              {__HOST__}/
            </label>
            <input
              ref={inputRef}
              className="w-full bg-gray-a1 px-2 py-1 text-gray10 placeholder:text-gray9 dark:placeholder:text-gray6"
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
          <div className="flex items-center gap-2">
            <button
              className="w-full bg-gray10 px-3 py-1 text-bg1 not-disabled:hover:bg-gray9 disabled:opacity-50 md:w-auto"
              disabled={mutation.isPending || !url.trim()}
              type="submit"
            >
              {mutation.isPending ? 'Checking' : 'Check'}
            </button>
          </div>
        </form>

        {error && (
          <pre className="overflow-x-auto whitespace-pre-wrap text-red9">
            {error}
          </pre>
        )}

        {score && (
          <div className="flex min-h-0 grow flex-col gap-6 md:flex-row md:gap-4">
            <div className="md:minimal-scrollbar flex w-full flex-col gap-6 md:basis-2/5 md:overflow-auto md:pe-4">
              <ScoreGauge score={score.overall} />

              <div className="flex flex-col gap-3">
                {score.categories.map((category) => (
                  <CategoryBar
                    key={category.label}
                    label={category.label}
                    score={category.score}
                  />
                ))}
              </div>

              {stats && (
                <div className="flex flex-col gap-1 text-gray9 dark:text-gray6">
                  <span>
                    <span className="text-gray10">
                      {stats.tokensCount.toLocaleString('en-US')}
                    </span>{' '}
                    tokens
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
                        <span className="text-green9">
                          ${formatCost(stats.tokensSaved, 3)}
                        </span>{' '}
                        saved (frontier)
                      </span>
                      <span>
                        <span className="text-green9">
                          ${formatCost(stats.tokensSaved, 0.5)}
                        </span>{' '}
                        saved (budget)
                      </span>
                    </>
                  )}
                </div>
              )}

              {score.categories.flatMap((c) => c.tips).length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="font-bold text-gray10">Tips</h2>
                  <ul className="flex flex-col gap-1 text-gray9 dark:text-gray6">
                    {score.categories
                      .flatMap((c) =>
                        c.tips.map((tip) => ({ category: c.label, tip })),
                      )
                      .map((item) => (
                        <li key={`${item.category}-${item.tip}`}>
                          <span className="text-gray10">{item.category}:</span>{' '}
                          {item.tip}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            {markdown && (
              <div className="relative -mx-6 w-auto min-w-0 md:mx-0 md:flex md:max-h-[calc(100dvh-14rem)] md:min-h-0 md:basis-3/5 md:flex-col">
                <div className="absolute end-2 top-2 z-10 hidden md:block">
                  <CopyButton text={markdown} />
                </div>
                <div className="flex min-h-0 grow flex-col bg-bg2">
                  <pre className="minimal-scrollbar whitespace-pre-wrap break-words px-6 py-4 text-gray10 leading-relaxed md:max-h-none md:min-h-0 md:grow md:overflow-auto md:p-6 md:leading-normal md:[scrollbar-gutter:stable]">
                    {markdown}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {!hasResult && !mutation.isPending && (
          <p className="text-gray9 dark:text-gray6">
            Enter a URL and click Check to see how well it converts to Markdown
          </p>
        )}
      </div>
    </div>
  )
}

function ScoreGauge(props: { score: number }) {
  const { score } = props
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const animated = useAnimatedValue(score, { delay: 300 })
  const offset = circumference - (animated / 100) * circumference
  const level = score >= 90 ? 'good' : score >= 50 ? 'ok' : 'bad'

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        aria-label={`Score: ${score}`}
        role="img"
        width="128"
        height="128"
        viewBox="0 0 120 120"
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--color-gray-a2)"
          strokeWidth="8"
        />
        <circle
          className="data-[level=bad]:stroke-red9 data-[level=good]:stroke-green9 data-[level=ok]:stroke-amber9"
          cx="60"
          cy="60"
          data-level={level}
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="8"
          transform="rotate(-90 60 60)"
        />
        <text
          dominantBaseline="central"
          fill="currentColor"
          fontFamily="var(--font-mono)"
          fontSize="32"
          textAnchor="middle"
          x="60"
          y="60"
        >
          {Math.round(animated)}
        </text>
      </svg>
    </div>
  )
}

function CategoryBar(props: { label: string; score: number }) {
  const { label, score } = props
  const animated = useAnimatedValue(score, { delay: 300 })
  const level = score >= 90 ? 'good' : score >= 50 ? 'ok' : 'bad'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-gray9 dark:text-gray6">
        <span>{label}</span>
        <span className="text-gray10">{Math.round(animated)}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-a2">
        <div
          className="h-full data-[level=bad]:bg-red9 data-[level=good]:bg-green9 data-[level=ok]:bg-amber9"
          data-level={level}
          style={{ width: `${animated}%` }}
        />
      </div>
    </div>
  )
}

function CopyButton(props: { text: string }) {
  const { text } = props
  const [copied, setCopied] = React.useState(false)

  return (
    <button
      className="flex items-center gap-1 text-gray9 hover:text-gray10 dark:text-gray6"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2_000)
      }}
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

function formatCost(tokens: number, perMillionDollars: number) {
  const cost = (tokens / 1_000_000) * perMillionDollars
  return cost < 0.01 ? cost.toFixed(4).replace(/0+$/, '0') : cost.toFixed(2)
}
