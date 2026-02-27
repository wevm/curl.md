import { waitUntil } from 'cloudflare:workers'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { fetchPage } from '#lib/core/fetch-page.ts'
import type { DB } from '#lib/db.gen.ts'
import { computeScore } from '#lib/score.ts'

export const ogQuerySchema = z
  .discriminatedUnion('page', [
    z.object({ page: z.literal('check'), url: z.string().optional() }),
    z.object({ page: z.literal('index') }),
    z.object({ page: z.literal('playground') }),
    z.object({ page: z.literal('url'), url: z.string() }),
  ])
  .catch({ page: 'index' })

export type OgQuery = z.infer<typeof ogQuerySchema>

export async function getOgElement(
  host: string,
  env: Cloudflare.Env,
  db: Kysely<DB>,
  query: OgQuery,
) {
  switch (query.page) {
    case 'check':
      return checkVariant(host, query)
    case 'url': {
      const tokensSaved = await getTokensSaved(env, db, query.url)
      return urlVariant(host, query.url, tokensSaved)
    }
    case 'playground': {
      const tokensSaved = await getTokensSaved(env, db)
      return playgroundVariant(host, tokensSaved)
    }
    case 'index': {
      const tokensSaved = await getTokensSaved(env, db)
      return indexVariant(host, tokensSaved)
    }
  }
}

function indexVariant(host: string, tokensSaved: number) {
  const teal = '#0cc0aa'
  return node('div', {
    style: {
      alignItems: 'flex-start',
      background: '#000000',
      color: '#ededed',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Geist Mono',
      height: '100%',
      justifyContent: 'center',
      paddingBottom: 140,
      paddingLeft: 80,
      paddingRight: 80,
      paddingTop: 80,
      width: '100%',
    },
    children: [
      node('div', {
        children: [
          node('span', {
            children: `${host}/`,
            style: { color: '#ededed' },
          }),
          node('span', {
            children: '<url>',
            style: { color: teal },
          }),
        ],
        style: { display: 'flex', fontSize: 48, fontWeight: 900 },
      }),
      node('div', {
        children: 'Fetch any URL as Markdown',
        style: { color: '#a1a1a1', fontSize: 48, marginTop: 12 },
      }),
      ...(tokensSaved > 0
        ? [
            node('div', {
              children: [
                node('span', {
                  children: formatNumber(tokensSaved),
                  style: { color: teal },
                }),
                node('span', {
                  children: '\u00a0tokens saved',
                  style: { color: '#a1a1a1' },
                }),
              ],
              style: { display: 'flex', fontSize: 48, marginTop: 8 },
            }),
            node('div', {
              children: [
                node('span', {
                  children: `$${formatCost(tokensSaved, 3)}`,
                  style: { color: teal },
                }),
                node('span', {
                  children: '\u00a0saved @ $3/M input tokens',
                  style: { color: '#a1a1a1' },
                }),
              ],
              style: { display: 'flex', fontSize: 48, marginTop: 8 },
            }),
          ]
        : []),
    ],
  })
}

function playgroundVariant(host: string, tokensSaved: number) {
  const teal = '#0cc0aa'
  return node('div', {
    style: {
      alignItems: 'flex-start',
      background: '#000000',
      color: '#ededed',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Geist Mono',
      height: '100%',
      justifyContent: 'center',
      paddingBottom: 140,
      paddingLeft: 80,
      paddingRight: 80,
      paddingTop: 80,
      width: '100%',
    },
    children: [
      node('div', {
        children: [
          node('span', {
            children: `${host}/`,
            style: { color: '#ededed' },
          }),
          node('span', {
            children: 'playground',
            style: { color: '#ededed' },
          }),
        ],
        style: { display: 'flex', fontSize: 48, fontWeight: 900 },
      }),
      node('div', {
        children: 'Fetch any URL as Markdown',
        style: { color: '#a1a1a1', fontSize: 48, marginTop: 12 },
      }),
      ...(tokensSaved > 0
        ? [
            node('div', {
              children: [
                node('span', {
                  children: formatNumber(tokensSaved),
                  style: { color: teal },
                }),
                node('span', {
                  children: '\u00a0tokens saved',
                  style: { color: '#a1a1a1' },
                }),
              ],
              style: { display: 'flex', fontSize: 48, marginTop: 8 },
            }),
            node('div', {
              children: [
                node('span', {
                  children: `$${formatCost(tokensSaved, 3)}`,
                  style: { color: teal },
                }),
                node('span', {
                  children: '\u00a0saved @ $3/M input tokens',
                  style: { color: '#a1a1a1' },
                }),
              ],
              style: { display: 'flex', fontSize: 48, marginTop: 8 },
            }),
          ]
        : []),
    ],
  })
}

async function checkVariant(host: string, query: { url?: string }) {
  const green = '#46a758'
  const gray = '#a1a1a1'
  const checkedUrl = query.url?.trim()
  let score = 0
  let tokens = 0
  let saved = 0

  if (checkedUrl && score === 0) {
    try {
      const validatedUrl = new URL(
        checkedUrl.includes('://') ? checkedUrl : `https://${checkedUrl}`,
      )
      const page = await fetchPage(validatedUrl, {})
      tokens = page.tokensCount
      saved = page.tokensSaved
      const result = computeScore({
        markdown: page.markdown,
        rawHtmlLength: (tokens + saved) * 4,
        tokensCount: tokens,
        tokensSaved: saved,
      })
      score = result.overall
    } catch {}
  }

  const scoreColor =
    score >= 90 ? '#46a758' : score >= 50 ? '#f0a000' : '#e5484d'

  const hostname = checkedUrl
    ? new URL(checkedUrl.includes('://') ? checkedUrl : `https://${checkedUrl}`)
        .hostname
    : undefined

  return node('div', {
    style: {
      background: '#000000',
      color: '#ededed',
      display: 'flex',
      fontFamily: 'Geist Mono',
      height: '100%',
      padding: 80,
      paddingBottom: 140,
      position: 'relative',
      width: '100%',
    },
    children: [
      node('div', {
        children: host,
        style: {
          bottom: 60,
          color: '#666',
          fontSize: 28,
          left: 80,
          position: 'absolute',
        },
      }),
      node('div', {
        style: {
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
        },
        children: [
          ...(hostname
            ? [
                node('div', {
                  children: [
                    node('img', {
                      src: `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
                      width: '72',
                      height: '72',
                      style: { borderRadius: 8, marginRight: 22 },
                    }),
                    node('span', {
                      children: checkedUrl,
                      style: { color: '#ededed', fontSize: 52 },
                    }),
                  ],
                  style: {
                    alignItems: 'center',
                    display: 'flex',
                    fontWeight: 900,
                  },
                }),
              ]
            : [
                node('div', {
                  children:
                    'Check how well your site converts to Markdown for AI agents',
                  style: { color: gray, fontSize: 36 },
                }),
              ]),
          ...(tokens > 0
            ? [
                node('div', {
                  children: [
                    node('span', {
                      children: formatNumber(tokens),
                      style: { color: '#ededed' },
                    }),
                    node('span', {
                      children: '\u00a0tokens',
                      style: { color: gray },
                    }),
                  ],
                  style: { display: 'flex', fontSize: 36, marginTop: 24 },
                }),
              ]
            : []),
          ...(saved > 0
            ? [
                node('div', {
                  children: [
                    node('span', {
                      children: formatNumber(saved),
                      style: { color: green },
                    }),
                    node('span', {
                      children: '\u00a0tokens saved',
                      style: { color: gray },
                    }),
                  ],
                  style: { display: 'flex', fontSize: 36, marginTop: 8 },
                }),
                node('div', {
                  children: [
                    node('span', {
                      children: `$${formatCost(saved, 3)}`,
                      style: { color: green },
                    }),
                    node('span', {
                      children: '\u00a0saved (frontier)',
                      style: { color: gray },
                    }),
                  ],
                  style: { display: 'flex', fontSize: 36, marginTop: 8 },
                }),
                node('div', {
                  children: [
                    node('span', {
                      children: `$${formatCost(saved, 0.5)}`,
                      style: { color: green },
                    }),
                    node('span', {
                      children: '\u00a0saved (budget)',
                      style: { color: gray },
                    }),
                  ],
                  style: { display: 'flex', fontSize: 36, marginTop: 8 },
                }),
              ]
            : []),
        ],
      }),
      node('div', {
        style: {
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          paddingLeft: 60,
        },
        children: [
          ...(score > 0 ? [scoreGauge(score, scoreColor)] : []),
          node('div', {
            children: [
              node('span', { children: 'Agent Readability' }),
              node('span', { children: 'Score' }),
            ],
            style: {
              color: score > 0 ? gray : '#ededed',
              display: 'flex',
              flexDirection: 'column',
              fontSize: 36,
              fontWeight: 900,
              marginTop: score > 0 ? 16 : 0,
              textAlign: 'center',
            },
          }),
        ],
      }),
    ],
  })
}

function scoreGauge(score: number, color: string) {
  const size = 320
  const radius = 140
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const center = size / 2

  return node('div', {
    style: {
      alignItems: 'center',
      display: 'flex',
      height: size,
      justifyContent: 'center',
      position: 'relative',
      width: size,
    },
    children: [
      node('svg', {
        viewBox: `0 0 ${size} ${size}`,
        width: String(size),
        height: String(size),
        style: { position: 'absolute' },
        children: [
          node('circle', {
            cx: String(center),
            cy: String(center),
            r: String(radius),
            fill: 'none',
            stroke: '#333',
            'stroke-width': '14',
          }),
          node('circle', {
            cx: String(center),
            cy: String(center),
            r: String(radius),
            fill: 'none',
            stroke: color,
            'stroke-width': '14',
            'stroke-dasharray': String(circumference),
            'stroke-dashoffset': String(offset),
            'stroke-linecap': 'round',
            transform: `rotate(-90 ${center} ${center})`,
          }),
        ],
      }),
      node('span', {
        children: String(score),
        style: {
          color,
          fontFamily: 'Geist Mono',
          fontSize: 108,
          fontWeight: 900,
        },
      }),
    ],
  })
}

function urlVariant(host: string, urlParam: string, tokensSaved: number) {
  const teal = '#0cc0aa'
  const hostname = new URL(
    /^https?:\/\//.test(urlParam) ? urlParam : `https://${urlParam}`,
  ).hostname
  return node('div', {
    style: {
      alignItems: 'flex-start',
      background: '#000000',
      color: '#ededed',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Geist Mono',
      height: '100%',
      justifyContent: 'center',
      paddingBottom: 140,
      paddingLeft: 80,
      paddingRight: 80,
      paddingTop: 80,
      width: '100%',
    },
    children: [
      node('div', {
        children: [
          node('span', {
            children: `${host}/`,
            style: { color: '#ededed' },
          }),
          node('span', {
            children: hostname,
            style: { color: teal },
          }),
        ],
        style: { display: 'flex', fontSize: 48, fontWeight: 900 },
      }),
      node('div', {
        children: 'Fetch any URL as Markdown',
        style: { color: '#a1a1a1', fontSize: 48, marginTop: 12 },
      }),
      ...(tokensSaved > 0
        ? [
            node('div', {
              children: [
                node('span', {
                  children: formatNumber(tokensSaved),
                  style: { color: teal },
                }),
                node('span', {
                  children: '\u00a0tokens saved',
                  style: { color: '#a1a1a1' },
                }),
              ],
              style: { display: 'flex', fontSize: 48, marginTop: 8 },
            }),
            node('div', {
              children: [
                node('span', {
                  children: `$${formatCost(tokensSaved, 3)}`,
                  style: { color: teal },
                }),
                node('span', {
                  children: '\u00a0saved @ $3/M input tokens',
                  style: { color: '#a1a1a1' },
                }),
              ],
              style: { display: 'flex', fontSize: 48, marginTop: 8 },
            }),
          ]
        : []),
    ],
  })
}

function node(type: string, props: Record<string, unknown>): React.ReactNode {
  return { type, props } as unknown as React.ReactNode
}

async function getTokensSaved(
  env: Cloudflare.Env,
  db: Kysely<DB>,
  urlParam?: string,
) {
  const hostname = urlParam
    ? new URL(/^https?:\/\//.test(urlParam) ? urlParam : `https://${urlParam}`)
        .hostname
    : undefined
  const cacheKey = hostname
    ? (`stats:tokens_saved:${hostname}` as const)
    : ('stats:tokens_saved' as const)
  const cached = await env.KV.get<number>(cacheKey, 'json')
  if (cached !== null) return cached

  let total: number
  if (hostname) {
    const result = await db
      .selectFrom('request')
      .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
      .where('hostname', '=', hostname)
      .executeTakeFirstOrThrow()
    total = result.total ?? 0
  } else {
    const result = await db
      .selectFrom('request')
      .select((eb) => eb.fn.sum<number>('tokens_saved').as('total'))
      .executeTakeFirstOrThrow()
    total = result.total ?? 0
  }
  waitUntil(env.KV.put(cacheKey, String(total), { expirationTtl: 60 }))
  return total
}

function formatCost(tokens: number, perMillionDollars: number) {
  const cost = (tokens / 1_000_000) * perMillionDollars
  return cost < 0.01 ? cost.toFixed(4).replace(/0+$/, '0') : cost.toFixed(2)
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function loadFont(request: Request, env: Cloudflare.Env, path: string) {
  const url = new URL(path, request.url)
  return env.ASSETS.fetch(url).then((r) => r.arrayBuffer())
}
