import { Tooltip } from '@base-ui/react/tooltip'
import * as React from 'react'

function Content(props: React.PropsWithChildren) {
  return <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-16">{props.children}</div>
}

function Heading(props: React.PropsWithChildren<{ level: 1 | 2 }>) {
  if (props.level === 1)
    return (
      <h1 className="bg-bg1 pt-5 pb-4 text-lg font-bold md:sticky md:top-0 md:z-10">
        {props.children}
      </h1>
    )
  return (
    <h2 className="text-gray8 mt-8 mb-2 text-xs font-medium tracking-wide uppercase">
      {props.children}
    </h2>
  )
}

function Section(props: React.PropsWithChildren<{ title: string }>) {
  return (
    <section className="mt-8">
      <h2 className="text-gray8 mb-2 text-xs font-medium tracking-wide uppercase">{props.title}</h2>
      {props.children}
    </section>
  )
}

function Stat(props: { label: string; tooltip?: React.ReactNode; value?: string | undefined }) {
  return (
    <div className="bg-gray-a1/50 border-gray-a3 relative border px-3 py-3">
      <div className="text-gray8 text-xs">{props.label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {props.value ?? <span className="text-gray5">&mdash;</span>}
      </div>
      {props.tooltip && (
        <Tooltip.Provider delay={0}>
          <Tooltip.Root>
            <Tooltip.Trigger
              className="text-gray7 hover:text-gray9 absolute end-3 top-3 hidden cursor-default sm:block"
              render={<button type="button" />}
            >
              <IconOcticonInfo16 aria-label="Info" className="size-3.5" />
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
      )}
    </div>
  )
}

function Table(props: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className="border-gray-a3 bg-gray-a1/50 border">
      <div className="minimal-scrollbar overflow-x-auto">
        <table className={`w-full ${props.className ?? 'text-xs'}`}>{props.children}</table>
      </div>
    </div>
  )
}

function Thead(props: React.PropsWithChildren) {
  return (
    <thead>
      <tr className="text-gray8 border-gray-a3 border-b text-start">{props.children}</tr>
    </thead>
  )
}

function Th(props: React.PropsWithChildren<{ align?: 'end'; className?: string }>) {
  return (
    <th
      className={`px-3 py-1.5 font-medium ${props.align === 'end' ? 'w-px text-end whitespace-nowrap' : 'text-start'} ${props.className ?? ''}`}
    >
      {props.children}
    </th>
  )
}

function Tr(props: React.PropsWithChildren<{ className?: string }>) {
  return (
    <tr
      className={`border-gray-a3 hover:bg-gray-a2/50 border-b last:border-b-0 ${props.className ?? ''}`}
    >
      {props.children}
    </tr>
  )
}

function Td(props: React.ComponentProps<'td'>) {
  const { className, children, ...rest } = props
  return (
    <td className={`px-3 py-1.5 ${className ?? ''}`} {...rest}>
      {children}
    </td>
  )
}

export const Dashboard = {
  Content,
  Heading,
  Section,
  Stat,
  Table: Object.assign(Table, { Td, Th, Thead, Tr }),
}
