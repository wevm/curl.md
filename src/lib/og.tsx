import { waitUntil } from 'cloudflare:workers'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { fetchPage } from '#lib/core/fetch-page.ts'
import type { DB } from '#lib/db.gen.ts'
import { formatCost, formatNumber } from '#lib/format.ts'
import { computeScore } from '#lib/score.ts'

export const schema = z
  .discriminatedUnion('page', [
    z.object({ page: z.literal('check'), url: z.string().optional() }),
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
    case 'check':
      return checkVariant(host, env, query)
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

async function checkVariant(
  host: string,
  env: Cloudflare.Env,
  query: { url?: string },
) {
  const green = '#46a758'
  const gray = '#a1a1a1'
  const checkedUrl = query.url?.trim()
  let score = 0
  let tokens = 0
  let saved = 0

  if (checkedUrl) {
    const cacheKey = `check:${checkedUrl}` as const
    const cached = await env.KV.get(cacheKey, 'json')
    if (cached) {
      score = cached.score
      tokens = cached.tokens
      saved = cached.saved
    } else {
      try {
        const validatedUrl = new URL(
          checkedUrl.includes('://') ? checkedUrl : `https://${checkedUrl}`,
        )
        const page = await fetchPage(validatedUrl)
        tokens = page.tokensCount
        saved = page.tokensSaved
        const result = computeScore({
          markdown: page.markdown,
          rawHtmlLength: (tokens + saved) * 4,
          tokensCount: tokens,
          tokensSaved: saved,
        })
        score = result.overall
        waitUntil(
          env.KV.put(cacheKey, JSON.stringify({ score, tokens, saved }), {
            expirationTtl: 3600,
          }),
        )
      } catch {}
    }
  }

  const scoreColor =
    score >= 90 ? '#46a758' : score >= 50 ? '#f0a000' : '#e5484d'

  const hostname = checkedUrl
    ? new URL(checkedUrl.includes('://') ? checkedUrl : `https://${checkedUrl}`)
        .hostname
    : undefined

  return (
    <div
      style={{
        background: '#000000',
        color: '#ededed',
        display: 'flex',
        fontFamily: 'Geist Mono',
        height: '100%',
        padding: 80,
        paddingBottom: 140,
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          bottom: 60,
          color: '#666',
          fontSize: 28,
          left: 80,
          position: 'absolute',
        }}
      >
        {host}
      </div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
        }}
      >
        {hostname ? (
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              fontWeight: 900,
            }}
          >
            <img
              alt=""
              src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=128`}
              width="72"
              height="72"
              style={{ borderRadius: 8, marginRight: 22 }}
            />
            <span style={{ color: '#ededed', fontSize: 52 }}>{checkedUrl}</span>
          </div>
        ) : (
          <div style={{ color: gray, fontSize: 36 }}>
            Check how well your site converts to Markdown for AI agents
          </div>
        )}
        {tokens > 0 && (
          <div style={{ display: 'flex', fontSize: 36, marginTop: 24 }}>
            <span style={{ color: '#ededed' }}>{formatNumber(tokens)}</span>
            <span style={{ color: gray }}>{'\u00a0'}tokens</span>
          </div>
        )}
        {saved > 0 && (
          <>
            <div style={{ display: 'flex', fontSize: 36, marginTop: 8 }}>
              <span style={{ color: green }}>{formatNumber(saved)}</span>
              <span style={{ color: gray }}>{'\u00a0'}tokens saved</span>
            </div>
            <div style={{ display: 'flex', fontSize: 36, marginTop: 8 }}>
              <span style={{ color: green }}>${formatCost(saved, 3)}</span>
              <span style={{ color: gray }}>{'\u00a0'}saved (frontier)</span>
            </div>
            <div style={{ display: 'flex', fontSize: 36, marginTop: 8 }}>
              <span style={{ color: green }}>${formatCost(saved, 0.5)}</span>
              <span style={{ color: gray }}>{'\u00a0'}saved (budget)</span>
            </div>
          </>
        )}
      </div>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          paddingLeft: 60,
        }}
      >
        {score > 0 && scoreGauge(score, scoreColor)}
        <div
          style={{
            color: score > 0 ? gray : '#ededed',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 36,
            fontWeight: 900,
            marginTop: score > 0 ? 16 : 0,
            textAlign: 'center',
          }}
        >
          <span>Agent Readability</span>
          <span>Score</span>
        </div>
      </div>
    </div>
  )
}

function scoreGauge(score: number, color: string) {
  const size = 320
  const radius = 140
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const center = size / 2

  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        height: size,
        justifyContent: 'center',
        position: 'relative',
        width: size,
      }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={String(size)}
        height={String(size)}
        style={{ position: 'absolute' }}
        aria-hidden="true"
      >
        <circle
          cx={String(center)}
          cy={String(center)}
          r={String(radius)}
          fill="none"
          stroke="#333"
          stroke-width="14"
        />
        <circle
          cx={String(center)}
          cy={String(center)}
          r={String(radius)}
          fill="none"
          stroke={color}
          stroke-width="14"
          stroke-dasharray={String(circumference)}
          stroke-dashoffset={String(offset)}
          stroke-linecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span
        style={{
          color,
          fontFamily: 'Geist Mono',
          fontSize: 108,
          fontWeight: 900,
        }}
      >
        {String(score)}
      </span>
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
