import * as Query from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import * as React from 'react'
import { createClient } from '#db/client.ts'
import { formatCost } from '#lib/format.ts'
import { rpc } from '#lib/rpc.ts'
import { getSessionLogin } from '#server/session.ts'

export const Route = createFileRoute('/home')({
  async beforeLoad() {
    const login = await getSessionLogin()
    if (!login) throw redirect({ to: '/' })
  },
  head() {
    const ogImage = rpc.api['og.png'].$url({ query: { page: 'index' } }).toString()
    return {
      meta: [
        { title: `${__HOST__}: Fetch any URL as Markdown` },
        { name: 'description', content: 'Fetch any URL as Markdown' },
        { property: 'og:title', content: __HOST__ },
        { property: 'og:description', content: 'Fetch any URL as Markdown' },
        { property: 'og:image', content: ogImage },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `https://${__HOST__}` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: __HOST__ },
        { name: 'twitter:description', content: 'Fetch any URL as Markdown' },
        { name: 'twitter:image', content: ogImage },
      ],
    }
  },
  component: Home,
})

export function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-1 px-6 pt-16 pb-16 text-lg">
      <h1 className="font-bold">curl.md</h1>
      <p className="text-gray9 dark:text-gray6">
        Fetch any URL as Markdown via <code className="text-teal9">{__HOST__}/&lt;url&gt;</code>
      </p>
      <TokensSaved />
      <div className="mt-4">
        <code className="text-gray9 dark:text-gray6 block"># Fetch full page</code>
        <code className="block">
          <span className="text-gray12">curl</span> {__HOST__}
          /example.com
        </code>
      </div>
      <div>
        <code className="text-gray9 dark:text-gray6 block"># Filter by objective</code>
        <code className="block">
          <span className="text-gray12">curl</span> {__HOST__}
          /example.com?
          <span className="text-gray10">q=pricing</span>
        </code>
      </div>
      <div>
        <code className="text-gray9 dark:text-gray6 block"># Filter by keywords</code>
        <code className="block">
          <span className="text-gray12">curl</span> {__HOST__}
          /example.com?
          <span className="text-gray10">k=api,auth</span>
        </code>
      </div>

      <div className="mt-4">
        <code className="text-gray9 dark:text-gray6 block"># Install agent skill</code>
        <code className="block">
          <span className="text-gray12">npx curl.md</span>{' '}
          <span className="text-gray10">skills add</span>
        </code>
      </div>
      <div>
        <code className="text-gray9 dark:text-gray6 block"># Use via CLI</code>
        <code className="block">
          <span className="text-gray12">npx curl.md</span>{' '}
          <span className="text-gray10">example.com</span>
        </code>
      </div>

      <footer className="text-gray9 dark:text-gray6 mt-4 flex flex-wrap gap-x-3 gap-y-1">
        <a
          className="hover:underline"
          href="https://github.com/wevm/curl.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <span>|</span>

        <a
          className="hover:underline"
          href="https://x.com/wevm_dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          X
        </a>
        <span>|</span>
        <a className="hover:underline" href="/playground">
          Playground
        </a>
        <span>|</span>
        <a className="hover:underline" href="/llms.txt">
          llms.txt
        </a>
      </footer>
    </div>
  )
}

function TokensSaved() {
  const getStats = useServerFn(getTokensSaved)
  const { data } = Query.useQuery({
    initialData: { tokens_saved: __INITIAL_TOKENS_SAVED__ },
    queryFn() {
      return getStats()
    },
    queryKey: ['stats'],
    refetchInterval: 10_000,
  })
  const total = data?.tokens_saved ?? 0
  const animated = useAnimatedValue(total, {
    duration: 500,
    from: 'previous',
  })
  return (
    <>
      <p className="text-gray9 dark:text-gray6">
        <span className="text-teal9 tabular-nums">{Math.round(animated).toLocaleString()}</span>{' '}
        tokens saved
      </p>
      <p className="text-gray9 dark:text-gray6">
        <span className="text-teal9 tabular-nums">${formatCost(animated, 3)}</span> saved @ $3/M
        input tokens
      </p>
    </>
  )
}

const getTokensSaved = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const request = getRequest()
    const origin = request.headers.get('origin')
    if (origin && origin !== `https://${env.HOST}`) throw new Error('Forbidden')

    const cached = await env.KV.get('stats:tokens_saved')
    if (cached !== null) return { tokens_saved: Number(cached) }

    const db = createClient(env.DB.connectionString)
    const result = await db
      .selectFrom('request')
      .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
      .executeTakeFirstOrThrow()
    return { tokens_saved: Number(result.total ?? 0) }
  } catch {
    return { tokens_saved: __INITIAL_TOKENS_SAVED__ }
  }
})

function useAnimatedValue(
  target: number,
  options?: { delay?: number; duration?: number; from?: 'previous' | 'zero' },
) {
  const { delay = 0, duration = 600, from = 'zero' } = options ?? {}
  const prev = React.useRef(from === 'previous' ? target : 0)
  const [value, setValue] = React.useState(from === 'previous' ? target : 0)

  React.useEffect(() => {
    if (from === 'previous' && target === 0) return
    const origin = from === 'zero' ? 0 : prev.current
    prev.current = target

    let cancelled = false
    const timeout = setTimeout(() => {
      let start: number | null = null

      function tick(now: number) {
        if (cancelled) return
        start ??= now
        const t = Math.min((now - start) / duration, 1)
        const eased = 1 - (1 - t) ** 3
        setValue(origin + (target - origin) * eased)
        if (t < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [target, delay, duration, from])

  return value
}
