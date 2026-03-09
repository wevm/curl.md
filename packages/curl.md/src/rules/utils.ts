import { defineRule } from '../mod.ts'

type Options = Required<Pick<defineRule.Config, 'key' | 'patterns'>>

export function appendMd(options: Options) {
  return defineRule({
    ...options,
    rewrite(url) {
      const mdUrl = new URL(url.href)
      mdUrl.pathname = `${mdUrl.pathname}.md`
      return mdUrl
    },
  })
}

export function appendIndexMd(options: Options) {
  return defineRule({
    ...options,
    rewrite(url) {
      const mdUrl = new URL(url.href)
      const base = mdUrl.pathname.endsWith('/')
        ? mdUrl.pathname
        : `${mdUrl.pathname}/`
      mdUrl.pathname = `${base}index.md`
      return mdUrl
    },
  })
}

export function appendMdWithIndex(options: Options) {
  return defineRule({
    ...options,
    rewrite(url) {
      const mdUrl = new URL(url.href)
      mdUrl.pathname = url.pathname.endsWith('/')
        ? `${mdUrl.pathname}index.md`
        : `${mdUrl.pathname}.md`
      return mdUrl
    },
  })
}

export function prefixedWithIndex(options: Options & { prefix: string }) {
  const { prefix, ...rest } = options
  return defineRule({
    ...rest,
    rewrite(url) {
      if (
        !url.pathname.startsWith(`${options.prefix}/`) &&
        url.pathname !== options.prefix
      )
        return
      if (
        url.pathname === options.prefix ||
        url.pathname === `${options.prefix}/`
      ) {
        const mdUrl = new URL(url.href)
        mdUrl.pathname = `${options.prefix}/index.md`
        return mdUrl
      }
      const mdUrl = new URL(url.href)
      mdUrl.pathname = `${mdUrl.pathname}.md`
      return mdUrl
    },
  })
}

export function repo(
  options: Options & {
    repo: string
    branch?: string
    prefix?: string
  },
) {
  const { branch = 'main', prefix, ...rest } = options
  return defineRule({
    ...rest,
    rewrite(url) {
      if (url.pathname === '/' || url.pathname === '') return
      return new URL(
        `https://raw.githubusercontent.com/${options.repo}/${branch}${prefix ? `/${prefix}` : ''}${url.pathname}.md`,
      )
    },
  })
}
