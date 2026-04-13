import { Tabs } from '@base-ui/react/tabs'
import * as Query from '@tanstack/react-query'
import { Link, type MetaDescriptor } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import * as React from 'react'
import { TextMorph } from 'torph/react'
import { Nav } from '#components/Nav.tsx'
import { useAnimatedValue } from '#hooks/useAnimatedValue.ts'
import { useCopyToClipboard } from '#hooks/useCopyToClipboard.ts'
import { formatCost } from '#lib/format.ts'
import { rpc } from '#lib/rpc.ts'
import { getSessionLogin } from '#server/session.ts'
import { getTokensSaved } from '#server/stats.ts'

export function head() {
  const ogImage = rpc.api['og.png'].$url({ query: { page: 'index' } }).toString()
  return {
    meta: [
      { title: 'curl.md - URL to markdown for agents' },
      { name: 'description', content: 'URL to markdown for agents' },
      { property: 'og:title', content: __HOST__ },
      { property: 'og:description', content: 'URL to markdown for agents' },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `https://${__HOST__}` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: __HOST__ },
      { name: 'twitter:description', content: 'URL to markdown for agents' },
      { name: 'twitter:image', content: ogImage },
    ] satisfies Array<MetaDescriptor>,
  }
}

export function Home(props: { login?: string | null | undefined }) {
  const fetchLogin = useServerFn(getSessionLogin)
  const { data: login } = Query.useQuery({
    initialData: props.login,
    queryFn: () => fetchLogin(),
    queryKey: ['session-login'],
  })

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Nav.Skip />

      <Nav.Root fixed>
        <Nav.Logo />
        <Nav.Group>
          <Link className="text-gray8 hover:text-gray10 px-3 py-1.5 text-sm" to="/docs">
            Docs
          </Link>
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
              to="/login"
            >
              Sign in
            </Link>
          )}
        </Nav.Group>
      </Nav.Root>

      <main className="flex-1" id={Nav.skipId}>
        <div className="mx-auto flex w-full max-w-2xl flex-col px-6">
          <TokensSaved />
          <h1 className="mt-8 text-4xl leading-[1.15] font-bold md:text-5xl">
            URL to markdown
            <br className="hidden md:block" /> for agents
          </h1>
          <p className="text-gray8 mt-4 text-lg leading-relaxed">
            Turn websites into optimized, low token output to supercharge your context. Works with
            every agent.
          </p>

          <div className="mt-12 flex flex-col gap-6">
            <div className="flex flex-col">
              <InstallCommand />
              <CostSaved />
            </div>
            <InstallTabs />
            <p className="text-gray8/90 -mt-3 ps-3 text-xs">
              Use CLI or prefix any URL with `
              <a
                className="hover:underline"
                href="https://curl.md/example.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                curl.md/
              </a>
              `
            </p>
          </div>

          <div className="mt-16 flex flex-col md:mt-32">
            <h2 className="text-lg font-bold">FAQ</h2>
            <div className="mt-4 flex flex-col">
              {faqs.map((faq) => (
                <details className="group" key={faq.question}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-sm">
                    <span className="text-gray8 dark:text-gray7 text-xs leading-none group-open:rotate-90">
                      ▶
                    </span>
                    {faq.question}
                  </summary>
                  <div className="text-gray8 ps-5 pb-3 text-sm leading-relaxed">{faq.answer}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-24 flex w-full items-center justify-center gap-4 px-6 py-6 text-sm md:mt-48">
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
          <Link className="text-gray8 hover:text-gray10" to="/docs">
            Docs
          </Link>
          <Link className="text-gray8 hover:text-gray10" to="/">
            Terms
          </Link>
          <Link className="text-gray8 hover:text-gray10" to="/">
            Privacy
          </Link>
          <a
            className="text-gray8 hover:text-gray10"
            href="#TODO"
            rel="noopener noreferrer"
            target="_blank"
          >
            Status
          </a>
          <a
            className="text-gray8 hover:text-gray10"
            href="https://github.com/wevm/curl.md"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          <a
            className="text-gray8 hover:text-gray10"
            href="https://x.com/wevm_dev"
            rel="noopener noreferrer"
            target="_blank"
          >
            X
          </a>
        </div>
      </footer>

      <div className="mt-4 flex justify-center overflow-hidden pb-32">
        <UrlShowcase />
      </div>
    </div>
  )
}

const faqs = [
  { question: 'What is curl.md?', answer: 'TODO' },
  {
    question: 'How do I use curl.md?',
    answer: 'TODO',
  },
  { question: 'How much does curl.md cost?', answer: 'TODO' },
  { question: 'Which coding agents does curl.md support?', answer: 'TODO' },
  {
    question: 'Is curl.md open source?',
    answer: (
      <>
        Yes, curl.md is fully open source. The source code is public on{' '}
        <a
          className="underline"
          href="https://github.com/wevm/curl.md"
          rel="noopener noreferrer"
          target="_blank"
        >
          GitHub
        </a>{' '}
        under the{' '}
        <a
          className="underline"
          href="https://github.com/wevm/curl.md/blob/main/LICENSE"
          rel="noopener noreferrer"
          target="_blank"
        >
          MIT License
        </a>
        , meaning anyone can use, modify, or contribute to its development. Anyone from the
        community can file issues, submit pull requests, and extend functionality.
      </>
    ),
  },
]

const showcaseUrls = [
  'bun.sh',
  'developer.mozilla.org',
  'developers.cloudflare.com',
  'developers.openai.com',
  'docs.anthropic.com',
  'docs.astral.sh',
  'docs.deno.com',
  'docs.github.com',
  'docs.stripe.com',
  'docs.tempo.xyz',
  'expressjs.com',
  'ghostty.org',
  'hono.dev',
  'laravel.com',
  'nextjs.org',
  'nodejs.org',
  'orm.drizzle.team',
  'oxc.rs',
  'planetscale.com',
  'pnpm.io',
  'prisma.io',
  'react.dev',
  'resend.com',
  'rspack.rs',
  'svelte.dev',
  'tailwindcss.com',
  'tanstack.com',
  'typescriptlang.org',
  'ui.shadcn.com',
  'vercel.com',
  'viem.sh',
  'vite.dev',
  'vitest.dev',
  'vuejs.org',
  'wagmi.sh',
  'zero.rocicorp.dev',
]

function UrlShowcase() {
  const [index, setIndex] = React.useState(0)
  const url = showcaseUrls[index % showcaseUrls.length]!

  React.useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % showcaseUrls.length)
    }, 3_000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="font-pixel text-base md:text-2xl">
      curl.md/
      <TextMorph className="text-gray8">{url}</TextMorph>
    </span>
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
    <p className="mt-24 flex items-center gap-3 text-sm md:mt-44">
      <span className="text-teal8 border-teal9/30 shrink-0 border px-1 py-0.5 text-xs uppercase">
        Live
      </span>
      <span className="text-gray8">
        <span className="tabular-nums">{Math.round(animated).toLocaleString()}</span> tokens saved
      </span>
      <Link className="text-gray8/90 hidden hover:underline md:inline" to="/docs">
        Install now
      </Link>
    </p>
  )
}

function CostSaved() {
  const getStats = useServerFn(getTokensSaved)
  const { data } = Query.useQuery({
    initialData: { tokens_saved: __INITIAL_TOKENS_SAVED__ },
    queryFn() {
      return getStats()
    },
    queryKey: ['stats'],
  })
  const total = data?.tokens_saved ?? 0
  const animated = useAnimatedValue(total, {
    duration: 500,
    from: 'previous',
  })
  return (
    <p className="text-gray8/90 mt-3 ps-3 text-xs tabular-nums">
      Users saved ${formatCost(animated, 3)} by using curl.md
    </p>
  )
}

const installCommands = [
  {
    name: 'curl' as const,
    plaintext: 'curl -fsSL https://curl.md/install.sh | bash',
    display: (
      <>
        <span className="text-gray8">curl -fsSL https://</span>
        <span className="text-gray10">curl.md/install.sh</span>
        <span className="text-gray8"> | bash</span>
      </>
    ),
  },
  {
    name: 'npm' as const,
    plaintext: 'npm i -g curl.md',
    display: (
      <>
        <span className="text-gray8">npm i -g</span> <span className="text-gray10">curl.md</span>
      </>
    ),
  },
  {
    name: 'bun' as const,
    plaintext: 'bun i -g curl.md',
    display: (
      <>
        <span className="text-gray8">bun i -g</span> <span className="text-gray10">curl.md</span>
      </>
    ),
  },
]

function InstallTabs() {
  const [tab, setTab] = React.useState(installCommands[0]!.name)
  const { copied, copy } = useCopyToClipboard()
  const active = installCommands.find((c) => c.name === tab)!

  return (
    <Tabs.Root value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
      <Tabs.List className="relative z-10 ms-px -mb-px flex">
        {installCommands.map((command) => (
          <Tabs.Tab
            className="text-gray9 data-[active]:text-gray10 data-[active]:border-gray10 border-b border-transparent px-3 py-2"
            key={command.name}
            value={command.name}
          >
            {command.name}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <button
        className="bg-gray-a1/50 border-gray-a3 mt-0 flex w-full items-center justify-between gap-4 border px-3 py-3 text-start transition-opacity hover:opacity-80"
        onClick={() => copy(active.plaintext)}
        type="button"
      >
        <code>{active.display}</code>
        <span className="text-gray8 shrink-0">
          {copied ? <IconOcticonCheck16 className="text-teal9" /> : <IconOcticonCopy16 />}
        </span>
      </button>
    </Tabs.Root>
  )
}

function InstallCommand() {
  const { copied, copy } = useCopyToClipboard({
    content: `I'd like you to set up https://curl.md, the best way to turn URLs into markdown.

If I have npm, install CLI and setup skill: npm i -g curl.md && curl.md skills add

If not, do this instead: curl -fsSL https://curl.md/install.sh | bash`,
    timeout: 5_000,
  })

  return (
    <button
      className="bg-gray10 text-bg1 relative flex items-center py-3 ps-3 pe-10 text-start transition-opacity hover:opacity-90"
      onClick={() => copy()}
      type="button"
    >
      <span>
        {copied ? (
          'Copied! Now paste into your agent'
        ) : (
          <>
            Copy <span className="hidden md:inline">setup</span> instructions for my agent
          </>
        )}
      </span>
      <span className="absolute end-3">
        {copied ? (
          <IconOcticonCheck16 className="text-teal9 size-4" />
        ) : (
          <IconOcticonCopy16 className="size-4" />
        )}
      </span>
    </button>
  )
}
