import { Tabs } from '@base-ui/react/tabs'
import { Tooltip } from '@base-ui/react/tooltip'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { sql } from 'kysely'
import * as React from 'react'
import { Dashboard } from '#components/Dashboard.tsx'
import { createClient } from '#db/client.ts'
import type { DB } from '#db/types.gen.ts'
import { useCopyToClipboard } from '#hooks/useCopyToClipboard.ts'
import * as Cookie from '#lib/cookie.ts'
import { formatCost } from '#lib/format.ts'

export const Route = createFileRoute('/_dash/$login/')({
  head: () => ({ meta: [{ title: __HOST__ }] }),
  loader: ({ context }) =>
    getUsageData({ data: { entityId: context.entity.id, entityType: context.entity.type } }),
  component: Component,
})

function Component() {
  const { entity } = Route.useRouteContext()
  const loaderData = Route.useLoaderData()
  const fetchUsage = useServerFn(getUsageData)

  const { data } = useQuery({
    initialData: loaderData,
    queryKey: ['dashboard-usage', entity.id],
    queryFn: () => fetchUsage({ data: { entityId: entity.id, entityType: entity.type } }),
    refetchInterval: 10_000,
  })

  return (
    <Dashboard.Content>
      <Dashboard.Heading level={1}>Overview</Dashboard.Heading>
      <div className="grid gap-3 md:grid-cols-2">
        <Dashboard.Stat
          label="Tokens Saved"
          value={data.tokens_saved ? Math.round(data.tokens_saved).toLocaleString() : undefined}
        />
        <Dashboard.Stat
          label="Cost Saved"
          tooltip={
            <>
              Estimated savings based on <strong>$3/M input tokens</strong> (typical LLM rate).
              Actual savings depend on your provider and model.
            </>
          }
          value={data.tokens_saved ? `$${formatCost(data.tokens_saved, 3)}` : undefined}
        />
      </div>
      <UsageChart daily={data.daily} />
      <RecentRequests requests={data.recent ?? []} />

      <div className="mt-8 flex flex-col gap-3">
        <Dashboard.Heading level={2}>Setup Tools</Dashboard.Heading>
        <InstallCommand />
        <InstallTabs />
      </div>
    </Dashboard.Content>
  )
}

// --- Server function ---

const getUsageData = createServerFn({ method: 'GET' })
  .inputValidator((d: { entityId: string; entityType: 'account' | 'organization' }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const sessionId = await Cookie.parseSigned(
      request.headers.get('cookie') ?? '',
      env.COOKIE_SECRET,
      'curl.session',
    )
    if (!sessionId) return { daily: [], tokens_saved: 0 }

    const requestColumn = c.data.entityType === 'organization' ? 'organization_id' : 'account_id'
    const statsResult = await db
      .selectFrom('request')
      .where(requestColumn, '=', c.data.entityId)
      .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
      .executeTakeFirst()

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const dailyRows = await db
      .selectFrom('request')
      .where(requestColumn, '=', c.data.entityId)
      .where('created_at', '>=', sevenDaysAgo)
      .select([
        sql<string>`to_char(created_at, 'YYYY-MM-DD')`.as('date'),
        (eb) => eb.fn.coalesce(eb.fn.sum<number>('tokens_saved'), sql<number>`0`).as('tokens'),
      ])
      .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
      .execute()

    const rowMap = new Map(dailyRows.map((r) => [r.date, Number(r.tokens)]))
    const daily: Array<{ date: string; tokens: number }> = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      daily.push({ date: key, tokens: rowMap.get(key) ?? 0 })
    }

    const recentRequests = await db
      .selectFrom('request')
      .where(requestColumn, '=', c.data.entityId)
      .select(['id', 'url', 'objective', 'keywords', 'cached', 'tokens_saved', 'created_at'])
      .orderBy('created_at', 'desc')
      .limit(10)
      .execute()

    return {
      daily,
      recent: recentRequests.map((r) => ({
        cached: r.cached ?? false,
        id: r.id,
        keywords: r.keywords,
        objective: r.objective,
        tokens_saved: r.tokens_saved ?? 0,
        url: r.url,
      })),
      tokens_saved: Number(statsResult?.total ?? 0),
    }
  })

// --- Components ---

const LazyUsageChart = React.lazy(() =>
  import('#components/UsageChart.tsx').then((m) => ({ default: m.UsageChart })),
)

function UsageChart(props: { daily: Array<{ date: string; tokens: number }> }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const hasData = props.daily.some((d) => d.tokens > 0)
  return (
    <div className="border-gray-a3 bg-gray-a1/50 relative mt-3 border px-3 py-3">
      {hasData ? (
        <>
          <h2 className="text-gray8 text-xs">Tokens Saved Last 7 Days</h2>
          {mounted ? (
            <React.Suspense fallback={<div className="mt-3 h-40" />}>
              <LazyUsageChart daily={props.daily} />
            </React.Suspense>
          ) : (
            <div className="mt-3 h-40" />
          )}
        </>
      ) : (
        <div className="flex h-[188px] flex-col items-center justify-center">
          <span className="text-sm font-bold">No Data</span>
          <span className="text-gray8 mt-1 text-sm">No usage in the last 7 days.</span>
        </div>
      )}
    </div>
  )
}

function RecentRequests(props: {
  requests: Array<
    Pick<DB.request, 'id' | 'keywords' | 'objective' | 'url'> & {
      cached: boolean
      tokens_saved: number
    }
  >
}) {
  if (props.requests.length === 0) return null
  return (
    <div className="mt-6">
      <h2 className="text-gray8 mb-2 text-xs font-medium tracking-wide uppercase">
        Recent Requests
      </h2>
      <Dashboard.Table className="text-xs">
        <Dashboard.Table.Thead>
          <Dashboard.Table.Th>URL</Dashboard.Table.Th>
          <Dashboard.Table.Th className="hidden md:table-cell" align="end" />
          <Dashboard.Table.Th align="end">Tokens Saved</Dashboard.Table.Th>
          <Dashboard.Table.Th align="end">Cost Saved</Dashboard.Table.Th>
        </Dashboard.Table.Thead>
        <tbody>
          {props.requests.map((r) => (
            <Dashboard.Table.Tr key={r.id}>
              <Dashboard.Table.Td className="max-w-0">
                <span className="block truncate" title={r.url}>
                  {r.url.replace(/^https?:\/\//, '')}
                </span>
              </Dashboard.Table.Td>
              <Dashboard.Table.Td className="hidden w-px whitespace-nowrap md:table-cell">
                <span className="inline-flex items-center gap-1.5">
                  {r.objective && (
                    <RequestIcon
                      icon={<IconOcticonGoal16 className="size-3" />}
                      tooltip={r.objective}
                    />
                  )}
                  {r.keywords && (
                    <RequestIcon
                      icon={<IconOcticonTag16 className="size-3" />}
                      tooltip={r.keywords}
                    />
                  )}
                  {r.cached && (
                    <RequestIcon icon={<IconOcticonZap16 className="size-3" />} tooltip="Cached" />
                  )}
                </span>
              </Dashboard.Table.Td>
              <Dashboard.Table.Td className="text-end whitespace-nowrap tabular-nums">
                {r.tokens_saved > 0 ? (
                  r.tokens_saved.toLocaleString()
                ) : (
                  <span className="text-gray5">&mdash;</span>
                )}
              </Dashboard.Table.Td>
              <Dashboard.Table.Td className="text-end whitespace-nowrap tabular-nums">
                {r.tokens_saved > 0 ? (
                  `$${formatCost(r.tokens_saved, 3)}`
                ) : (
                  <span className="text-gray5">&mdash;</span>
                )}
              </Dashboard.Table.Td>
            </Dashboard.Table.Tr>
          ))}
        </tbody>
      </Dashboard.Table>
    </div>
  )
}

// --- Helpers ---

function RequestIcon(props: { icon: React.ReactNode; tooltip: React.ReactNode }) {
  return (
    <Tooltip.Provider delay={0}>
      <Tooltip.Root>
        <Tooltip.Trigger className="text-gray6 cursor-default" render={<span />}>
          {props.icon}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={4}>
            <Tooltip.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative z-50 max-w-64 border px-2.5 py-1.5 text-xs leading-relaxed before:absolute before:inset-0 before:-z-1">
              {props.tooltip}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
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
        className="bg-gray-a1/50 border-gray-a3 hover:bg-gray-a2/50 mt-0 flex w-full items-center justify-between gap-4 border border-b-0 px-3 py-3 text-start transition-colors"
        onClick={() => copy(active.plaintext)}
        type="button"
      >
        <code>{active.display}</code>
        <span className="text-gray8 shrink-0">
          {copied ? <IconOcticonCheck16 className="text-teal9" /> : <IconOcticonCopy16 />}
        </span>
      </button>
      <AuthLoginCommand />
    </Tabs.Root>
  )
}

function AuthLoginCommand() {
  const { copied, copy } = useCopyToClipboard()
  return (
    <button
      className="bg-gray-a1/50 border-gray-a3 hover:bg-gray-a2/50 flex w-full items-center justify-between gap-4 border px-3 py-3 text-start transition-colors"
      onClick={() => copy('curl.md auth login')}
      type="button"
    >
      <code>
        <span className="text-gray8">curl.md</span> <span className="text-gray10">auth login</span>
      </code>
      <span className="text-gray8 shrink-0">
        {copied ? <IconOcticonCheck16 className="text-teal9" /> : <IconOcticonCopy16 />}
      </span>
    </button>
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
