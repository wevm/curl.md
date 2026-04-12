import { Link } from '@tanstack/react-router'
import * as React from 'react'
import type { Doc } from './-docs.ts'

export function DocContent(props: { doc: Doc }) {
  const { doc } = props

  return (
    <div className="mx-auto flex w-full max-w-[76rem] justify-center">
      <article className="w-full max-w-2xl min-w-0 px-8 py-8 md:px-12 lg:pe-0">
        <doc.Component components={mdxComponents} />
      </article>

      {doc.headings.length > 0 && (
        <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-56 shrink-0 overflow-y-auto py-8 pe-6 lg:block">
          <p className="text-gray8 text-xs font-medium tracking-wide uppercase">On this page</p>
          <ul className="mt-3 flex flex-col gap-1">
            {doc.headings.map((h) => (
              <li key={h.id} style={{ paddingInlineStart: `${(h.level - 2) * 0.75}rem` }}>
                <a className="text-gray8 hover:text-gray10 block py-0.5 text-sm" href={`#${h.id}`}>
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}

// --- Internal ---

const mdxComponents = {
  a: (props: React.ComponentProps<'a'>) => {
    const { href, children, ...rest } = props
    if (href?.startsWith('/'))
      return (
        <Link className="text-blue9 hover:underline" to={href}>
          {children}
        </Link>
      )
    return (
      <a className="text-blue9 hover:underline" href={href} {...rest}>
        {children}
      </a>
    )
  },
  code: (props: React.ComponentProps<'code'>) => (
    <code className="bg-gray-a2 px-1 py-0.5 text-[0.875em]" {...props} />
  ),
  h1: (props: React.ComponentProps<'h1'>) => <h1 className="text-lg font-bold" {...props} />,
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2 className="mt-10 text-base font-bold" {...props} />
  ),
  h3: (props: React.ComponentProps<'h3'>) => <h3 className="mt-8 font-bold" {...props} />,
  hr: () => <hr className="border-gray-a3 my-8" />,
  li: (props: React.ComponentProps<'li'>) => <li className="text-gray9 mt-1 ps-1" {...props} />,
  ol: (props: React.ComponentProps<'ol'>) => (
    <ol className="text-gray9 mt-4 list-decimal ps-6" {...props} />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p className="text-gray9 mt-4 leading-relaxed" {...props} />
  ),
  pre: (props: React.ComponentProps<'pre'>) => (
    <pre
      className="bg-gray-a1/50 border-gray-a3 minimal-scrollbar mt-4 overflow-x-auto border px-4 py-3 text-[0.8125rem] leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  ul: (props: React.ComponentProps<'ul'>) => (
    <ul className="text-gray9 mt-4 list-disc ps-6" {...props} />
  ),
}
