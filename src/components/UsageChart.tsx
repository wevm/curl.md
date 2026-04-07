import * as React from 'react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { estimateCost } from '#lib/format.ts'

export function UsageChart(props: {
  daily: Array<{ date: string; tokens: number }>
  mode?: 'cost' | 'tokens'
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [size, setSize] = React.useState<{ height: number; width: number } | null>(null)
  const isCost = props.mode === 'cost'

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { height, width } = entry.contentRect
      if (width > 0 && height > 0) setSize({ height, width })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const data = props.daily.map((d) => ({
    ...d,
    label: formatDate(d.date),
    value: isCost ? estimateCost(d.tokens, 3) : d.tokens,
  }))
  const max = Math.max(...data.map((d) => d.value), isCost ? 0.01 : 1)
  const step = niceStep(max)
  const ceil = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(ceil / step) + 1 }, (_, i) => i * step)
  const yAxisWidth = isCost
    ? Math.max(...ticks.map((t) => formatCostCompact(t).length)) * 8 + 8
    : Math.max(...ticks.map((t) => formatCompact(t).length)) * 8 + 8
  return (
    <div
      aria-label={`Usage chart: ${data.map((d) => `${d.label} ${isCost ? `$${d.value.toFixed(2)}` : `${d.tokens.toLocaleString()} tokens`}`).join(', ')}`}
      className="mt-3 h-56"
      ref={ref}
      role="img"
    >
      {!size ? (
        <div className="bg-gray-a1/50 h-full w-full" />
      ) : (
        <BarChart
          data={data}
          height={size.height}
          margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          width={size.width}
        >
          <CartesianGrid horizontalValues={ticks} vertical={false} stroke="var(--color-gray3)" />
          <XAxis
            axisLine={false}
            dataKey="label"
            height={24}
            minTickGap={4}
            tick={{ fill: 'var(--color-gray8)', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            domain={[0, ceil]}
            width={yAxisWidth}
            tick={{ fill: 'var(--color-gray8)', fontSize: 12 }}
            tickFormatter={isCost ? formatCostCompact : formatCompact}
            tickLine={false}
            ticks={ticks}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const { label, tokens, value } = payload[0].payload
              return (
                <div className="border-gray-a3 bg-bg1 border px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{label}</div>
                  <div className="text-gray8 mt-0.5">
                    {isCost
                      ? `$${Number(value).toFixed(2)}`
                      : `${Number(tokens).toLocaleString()} tokens`}
                  </div>
                </div>
              )
            }}
            cursor={{ fill: 'var(--color-gray3)' }}
            isAnimationActive={false}
          />
          <Bar dataKey="value" fill="var(--color-blue9)" isAnimationActive={false} />
        </BarChart>
      )}
    </div>
  )
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

function niceStep(max: number) {
  const rough = max / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

function formatCostCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  if (n >= 1) return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`
  if (n >= 0.01) return `$${n.toFixed(2)}`
  if (n === 0) return '$0'
  return `$${n.toFixed(3)}`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
