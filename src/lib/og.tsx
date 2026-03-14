import { waitUntil } from 'cloudflare:workers'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { DB } from '#db/types.gen.ts'
import { formatCost, formatNumber } from '#lib/format.ts'
export const schema = z
  .discriminatedUnion('page', [
    z.object({ page: z.literal('index') }),
    z.object({ page: z.literal('playground') }),
    z.object({ page: z.literal('url'), url: z.string() }),
  ])
  .catch({ page: 'index' })

export type query = z.infer<typeof schema>

export async function getElement(
  host: string,
  env: Cloudflare.Env,
  db: Kysely<DB>,
  query: query,
) {
  switch (query.page) {
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
  return (
    <div
      style={{
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
      }}
    >
      <div style={{ display: 'flex', fontSize: 48, fontWeight: 900 }}>
        <span style={{ color: '#ededed' }}>{host}/</span>
        <span style={{ color: teal }}>{'<url>'}</span>
      </div>
      <div style={{ color: '#a1a1a1', fontSize: 48, marginTop: 12 }}>
        Fetch any URL as Markdown
      </div>
      {tokensSaved > 0 && (
        <>
          <div style={{ display: 'flex', fontSize: 48, marginTop: 8 }}>
            <span style={{ color: teal }}>{formatNumber(tokensSaved)}</span>
            <span style={{ color: '#a1a1a1' }}>{'\u00a0'}tokens saved</span>
          </div>
          <div style={{ display: 'flex', fontSize: 48, marginTop: 8 }}>
            <span style={{ color: teal }}>${formatCost(tokensSaved, 3)}</span>
            <span style={{ color: '#a1a1a1' }}>
              {'\u00a0'}saved @ $3/M input tokens
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function playgroundVariant(host: string, tokensSaved: number) {
  const teal = '#0cc0aa'
  return (
    <div
      style={{
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
      }}
    >
      <div style={{ display: 'flex', fontSize: 48, fontWeight: 900 }}>
        <span style={{ color: '#ededed' }}>{host}/</span>
        <span style={{ color: '#ededed' }}>playground</span>
      </div>
      <div style={{ color: '#a1a1a1', fontSize: 48, marginTop: 12 }}>
        Fetch any URL as Markdown
      </div>
      {tokensSaved > 0 && (
        <>
          <div style={{ display: 'flex', fontSize: 48, marginTop: 8 }}>
            <span style={{ color: teal }}>{formatNumber(tokensSaved)}</span>
            <span style={{ color: '#a1a1a1' }}>{'\u00a0'}tokens saved</span>
          </div>
          <div style={{ display: 'flex', fontSize: 48, marginTop: 8 }}>
            <span style={{ color: teal }}>${formatCost(tokensSaved, 3)}</span>
            <span style={{ color: '#a1a1a1' }}>
              {'\u00a0'}saved @ $3/M input tokens
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function urlVariant(host: string, urlParam: string, tokensSaved: number) {
  const teal = '#0cc0aa'
  const hostname = new URL(
    /^https?:\/\//.test(urlParam) ? urlParam : `https://${urlParam}`,
  ).hostname
  return (
    <div
      style={{
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
      }}
    >
      <div style={{ display: 'flex', fontSize: 48, fontWeight: 900 }}>
        <span style={{ color: '#ededed' }}>{host}/</span>
        <span style={{ color: teal }}>{hostname}</span>
      </div>
      <div style={{ color: '#a1a1a1', fontSize: 48, marginTop: 12 }}>
        Fetch any URL as Markdown
      </div>
      {tokensSaved > 0 && (
        <>
          <div style={{ display: 'flex', fontSize: 48, marginTop: 8 }}>
            <span style={{ color: teal }}>{formatNumber(tokensSaved)}</span>
            <span style={{ color: '#a1a1a1' }}>{'\u00a0'}tokens saved</span>
          </div>
          <div style={{ display: 'flex', fontSize: 48, marginTop: 8 }}>
            <span style={{ color: teal }}>${formatCost(tokensSaved, 3)}</span>
            <span style={{ color: '#a1a1a1' }}>
              {'\u00a0'}saved @ $3/M input tokens
            </span>
          </div>
        </>
      )}
    </div>
  )
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
  const cached = await env.KV.get(cacheKey, 'json')
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

export async function loadFont(request: Request, env: Env, path: string) {
  const url = new URL(path, request.url)
  return env.ASSETS.fetch(url).then((r) => r.arrayBuffer())
}
