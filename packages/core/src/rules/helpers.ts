import type { Rule } from '../defineRule.ts'

export function appendMdUrl(url: URL): URL {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = `${mdUrl.pathname}.md`
  return mdUrl
}

function appendIndexMdUrl(url: URL): URL {
  const mdUrl = new URL(url.href)
  const base = mdUrl.pathname.endsWith('/')
    ? mdUrl.pathname
    : `${mdUrl.pathname}/`
  mdUrl.pathname = `${base}index.md`
  return mdUrl
}

function appendMdWithIndexUrl(url: URL): URL {
  const mdUrl = new URL(url.href)
  mdUrl.pathname = url.pathname.endsWith('/')
    ? `${mdUrl.pathname}index.md`
    : `${mdUrl.pathname}.md`
  return mdUrl
}

export function appendMd(options: { patterns: (string | RegExp)[] }): Rule {
  return { patterns: options.patterns, resolve: appendMdUrl }
}

export function appendIndexMd(options: {
  patterns: (string | RegExp)[]
}): Rule {
  return { patterns: options.patterns, resolve: appendIndexMdUrl }
}

export function appendMdWithIndex(options: {
  patterns: (string | RegExp)[]
}): Rule {
  return { patterns: options.patterns, resolve: appendMdWithIndexUrl }
}

export function githubRepo(options: {
  repo: string
  branch?: string
  prefix?: string
  patterns: (string | RegExp)[]
}): Rule {
  const branch = options.branch ?? 'main'
  const prefix = options.prefix
  return {
    patterns: options.patterns,
    resolve: (url) => {
      if (url.pathname === '/' || url.pathname === '') return
      return new URL(
        `https://raw.githubusercontent.com/${options.repo}/${branch}${prefix ? `/${prefix}` : ''}${url.pathname}.md`,
      )
    },
  }
}

export function prefixedWithIndex(options: {
  prefix: string
  patterns: (string | RegExp)[]
}): Rule {
  return {
    patterns: options.patterns,
    resolve: (url) => {
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
      return appendMdUrl(url)
    },
  }
}
