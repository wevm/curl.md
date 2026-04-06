import { Tabs } from '@base-ui/react/tabs'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { sql } from 'kysely'
import * as React from 'react'
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
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-16">
      <h1 className="bg-bg1 sticky top-0 z-10 py-4 text-lg font-bold">Overview</h1>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <StatCard
          label="Tokens Saved"
          value={data.tokens_saved ? Math.round(data.tokens_saved).toLocaleString() : undefined}
        />
        <StatCard
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

      <div className="mt-8 flex flex-col gap-6">
        <h2 className="text-gray8 text-sm font-bold">Setup Tools</h2>
        <InstallCommand />
        <InstallTabs />
      </div>
    </div>
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

function StatCard(props: { label: string; tooltip?: React.ReactNode; value?: string | undefined }) {
  return (
    <div className="bg-gray-a1/50 border-gray-a3 relative border px-3 py-3">
      <div className="text-gray8 text-xs">{props.label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {props.value ?? <span className="text-gray5">&mdash;</span>}
      </div>
      {props.tooltip && (
        <BaseTooltip.Provider delay={0}>
          <BaseTooltip.Root>
            <BaseTooltip.Trigger
              className="text-gray5 hover:text-gray7 absolute end-3 top-3 cursor-default"
              render={<span />}
            >
              <IconOcticonInfo16 className="size-3.5" />
            </BaseTooltip.Trigger>
            <BaseTooltip.Portal>
              <BaseTooltip.Positioner sideOffset={4}>
                <BaseTooltip.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative z-50 max-w-64 border px-2.5 py-1.5 text-xs leading-relaxed before:absolute before:inset-0 before:-z-1">
                  {props.tooltip}
                </BaseTooltip.Popup>
              </BaseTooltip.Positioner>
            </BaseTooltip.Portal>
          </BaseTooltip.Root>
        </BaseTooltip.Provider>
      )}
    </div>
  )
}

const LazyUsageChart = React.lazy(() =>
  import('#components/UsageChart.tsx').then((m) => ({ default: m.UsageChart })),
)

function UsageChart(props: { daily: Array<{ date: string; tokens: number }> }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const hasData = props.daily.some((d) => d.tokens > 0)
  return (
    <div className="border-gray-a3 bg-gray-a1/50 relative mt-4 border px-3 py-3">
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
    <div className="border-gray-a3 bg-gray-a1/50 mt-4 border">
      <h2 className="text-gray8 px-3 pt-3 text-xs">Recent Requests</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray8 border-gray-a3 border-b text-start">
              <th className="px-3 py-1.5 text-start font-medium">URL</th>
              <th className="w-px px-3 py-1.5" />
              <th className="w-px px-3 py-1.5 text-end font-medium whitespace-nowrap">
                Tokens Saved
              </th>
              <th className="w-px px-3 py-1.5 text-end font-medium whitespace-nowrap">
                Cost Saved
              </th>
            </tr>
          </thead>
          <tbody>
            {props.requests.map((r) => (
              <tr
                className="border-gray-a3 hover:bg-gray-a2/50 border-b last:border-b-0"
                key={r.id}
              >
                <td className="max-w-0 px-3 py-1.5">
                  <span className="block truncate" title={r.url}>
                    {r.url.replace(/^https?:\/\//, '')}
                  </span>
                </td>
                <td className="w-px px-3 py-1.5 whitespace-nowrap">
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
                      <RequestIcon
                        icon={<IconOcticonZap16 className="size-3" />}
                        tooltip="Cached"
                      />
                    )}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-end whitespace-nowrap tabular-nums">
                  {r.tokens_saved > 0 ? (
                    r.tokens_saved.toLocaleString()
                  ) : (
                    <span className="text-gray5">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-end whitespace-nowrap tabular-nums">
                  {r.tokens_saved > 0 ? (
                    `$${formatCost(r.tokens_saved, 3)}`
                  ) : (
                    <span className="text-gray5">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Helpers ---

function RequestIcon(props: { icon: React.ReactNode; tooltip: React.ReactNode }) {
  return (
    <BaseTooltip.Provider delay={0}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger className="text-gray6 cursor-default" render={<span />}>
          {props.icon}
        </BaseTooltip.Trigger>
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner sideOffset={4}>
            <BaseTooltip.Popup className="bg-bg1 border-gray-a3 before:bg-gray-a1/50 relative z-50 max-w-64 border px-2.5 py-1.5 text-xs leading-relaxed before:absolute before:inset-0 before:-z-1">
              {props.tooltip}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
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
