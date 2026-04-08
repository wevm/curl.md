import { Tabs } from '@base-ui/react/tabs'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { sql } from 'kysely'
import * as React from 'react'
import { Dashboard } from '#components/Dashboard.tsx'
import { createClient } from '#db/client.ts'
import { requestTokensSavedSql, requestTokensSavedSumSql } from '#db/utils.ts'
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
    staleTime: 10_000,
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

      <Dashboard.Section title="Setup Tools">
        <div className="flex flex-col gap-3">
          <InstallCommand />
          <InstallTabs />
        </div>
      </Dashboard.Section>
    </Dashboard.Content>
  )
}

// --- Server function ---

const getUsageData = createServerFn({ method: 'GET' })
  .inputValidator((d: { entityId: string; entityType: 'account' | 'organization' }) => d)
  .handler(async (c) => {
    const request = getRequest()
    const db = createClient(env.DB.connectionString)
    const timeZone = (request as { cf?: { timezone?: string } }).cf?.timezone ?? 'UTC'
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
      .select(requestTokensSavedSumSql().as('total'))
      .executeTakeFirst()

    const startOfWindowSql = sql<Date>`((date_trunc('day', now() AT TIME ZONE ${timeZone}) - interval '6 days') AT TIME ZONE ${timeZone})`

    const dailyRows = await db
      .selectFrom(
        db
          .selectFrom('request')
          .where(requestColumn, '=', c.data.entityId)
          .where('created_at', '>=', startOfWindowSql)
          .select([
            sql<string>`to_char(created_at AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`.as('date'),
            requestTokensSavedSql().as('tokens_saved_total'),
          ])
          .as('daily_request'),
      )
      .select(['date', sql<number>`coalesce(sum(tokens_saved_total), 0)`.as('tokens')])
      .groupBy('date')
      .execute()

    const rowMap = new Map(dailyRows.map((r) => [r.date, Number(r.tokens)]))
    const daily = getTrailingDateKeys(new Date(), 7, timeZone).map((date) => ({
      date,
      tokens: rowMap.get(date) ?? 0,
    }))

    return {
      daily,
      tokens_saved: Number(statsResult?.total ?? 0),
    }
  })

// --- Components ---

const LazyUsageChart = React.lazy(() =>
  import('#components/UsageChart.tsx').then((m) => ({ default: m.UsageChart })),
)

function UsageChart(props: { daily: Array<{ date: string; tokens: number }> }) {
  const [mounted, setMounted] = React.useState(false)
  const [mode, setMode] = React.useState<'cost' | 'tokens'>('tokens')
  React.useEffect(() => setMounted(true), [])
  const hasData = props.daily.some((d) => d.tokens > 0)

  if (!hasData) {
    return (
      <div className="border-gray-a3 bg-gray-a1/50 relative mt-3 flex h-[228px] flex-col border px-3 py-3">
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="text-sm font-bold">No Data</span>
          <span className="text-gray8 mt-1 text-sm">No usage in the last 7 days.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="border-gray-a3 bg-gray-a1/50 relative mt-3 flex h-[228px] flex-col border px-3 py-3">
      <div className="flex items-center gap-2">
        <ToggleGroup
          className="border-gray-a3 flex border p-0.5 text-xs"
          value={[mode]}
          onValueChange={(value) => {
            if (value.length > 0) setMode(value[0] as 'cost' | 'tokens')
          }}
        >
          <Toggle
            className="text-gray8 hover:text-gray10 data-[pressed]:bg-gray-a2 data-[pressed]:text-gray10 px-2.5 py-1"
            value="tokens"
          >
            Tokens
          </Toggle>
          <Toggle
            className="text-gray8 hover:text-gray10 data-[pressed]:bg-gray-a2 data-[pressed]:text-gray10 px-2.5 py-1"
            value="cost"
          >
            Cost
          </Toggle>
        </ToggleGroup>
        <span className="text-gray8 text-xs">Saved Last 7 Days</span>
      </div>
      {mounted ? (
        <React.Suspense fallback={<div className="bg-gray-a1/50 mt-3 h-56" />}>
          <LazyUsageChart daily={props.daily} mode={mode} />
        </React.Suspense>
      ) : (
        <div className="bg-gray-a1/50 mt-3 h-56" />
      )}
    </div>
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

const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>()

export function formatDateKey(date: Date, timeZone: string) {
  const parts = getDateKeyFormatter(timeZone).formatToParts(date)
  const day = parts.find((part) => part.type === 'day')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const year = parts.find((part) => part.type === 'year')?.value
  if (!day || !month || !year) throw new Error(`Could not format date key for ${timeZone}`)
  return `${year}-${month}-${day}`
}

export function getTrailingDateKeys(now: Date, days: number, timeZone: string) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - (days - i - 1))
    return formatDateKey(date, timeZone)
  })
}

function getDateKeyFormatter(timeZone: string) {
  const existing = dateKeyFormatters.get(timeZone)
  if (existing) return existing

  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  })
  dateKeyFormatters.set(timeZone, formatter)
  return formatter
}
