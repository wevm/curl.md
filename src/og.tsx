import { waitUntil } from 'cloudflare:workers'
import { z } from 'zod'
import type { Database } from '#db/client.ts'
import { requestTokensSavedSumSql } from '#db/utils.ts'
import { formatCost } from '#lib/format.ts'

export const schema = z
  .discriminatedUnion('page', [
    z.object({ page: z.literal('index') }),
    z.object({ page: z.literal('playground') }),
    z.object({ page: z.literal('url'), url: z.string() }),
  ])
  .catch({ page: 'index' })

export type query = z.infer<typeof schema>

async function getElement(host: string, env: Cloudflare.Env, db: Database, query: query) {
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
  return (
    <div tw="flex flex-col items-start justify-center w-full h-full bg-black text-[#ededed] font-[Geist_Mono] pt-[80px] px-[80px] pb-[140px]">
      <div tw="flex text-[48px] font-black">
        <span tw="text-[#ededed]">{host}/</span>
        <span tw="text-[#0cc0aa]">{'<url>'}</span>
      </div>
      <div tw="text-[#a1a1a1] text-[48px] mt-[12px]">URL to markdown for agents</div>
      {tokensSaved > 0 && (
        <>
          <div tw="flex text-[48px] mt-[8px]">
            <span tw="text-[#0cc0aa]">{tokensSaved.toLocaleString()}</span>
            <span tw="text-[#a1a1a1]"> tokens saved</span>
          </div>
          <div tw="flex text-[48px] mt-[8px]">
            <span tw="text-[#0cc0aa]">${formatCost(tokensSaved, 3)}</span>
            <span tw="text-[#a1a1a1]"> saved @ $3/M input tokens</span>
          </div>
        </>
      )}
    </div>
  )
}

function playgroundVariant(host: string, tokensSaved: number) {
  return (
    <div tw="flex flex-col items-start justify-center w-full h-full bg-black text-[#ededed] font-[Geist_Mono] pt-[80px] px-[80px] pb-[140px]">
      <div tw="flex text-[48px] font-black">
        <span tw="text-[#ededed]">{host}/</span>
        <span tw="text-[#ededed]">playground</span>
      </div>
      <div tw="text-[#a1a1a1] text-[48px] mt-[12px]">URL to markdown for agents</div>
      {tokensSaved > 0 && (
        <>
          <div tw="flex text-[48px] mt-[8px]">
            <span tw="text-[#0cc0aa]">{tokensSaved.toLocaleString()}</span>
            <span tw="text-[#a1a1a1]"> tokens saved</span>
          </div>
          <div tw="flex text-[48px] mt-[8px]">
            <span tw="text-[#0cc0aa]">${formatCost(tokensSaved, 3)}</span>
            <span tw="text-[#a1a1a1]"> saved @ $3/M input tokens</span>
          </div>
        </>
      )}
    </div>
  )
}

function urlVariant(host: string, urlParam: string, tokensSaved: number) {
  const hostname = new URL(/^https?:\/\//.test(urlParam) ? urlParam : `https://${urlParam}`)
    .hostname
  return (
    <div tw="flex flex-col items-start justify-center w-full h-full bg-black text-[#ededed] font-[Geist_Mono] pt-[80px] px-[80px] pb-[140px]">
      <div tw="flex text-[48px] font-black">
        <span tw="text-[#ededed]">{host}/</span>
        <span tw="text-[#0cc0aa]">{hostname}</span>
      </div>
      <div tw="text-[#a1a1a1] text-[48px] mt-[12px]">URL to markdown for agents</div>
      {tokensSaved > 0 && (
        <>
          <div tw="flex text-[48px] mt-[8px]">
            <span tw="text-[#0cc0aa]">{tokensSaved.toLocaleString()}</span>
            <span tw="text-[#a1a1a1]"> tokens saved</span>
          </div>
          <div tw="flex text-[48px] mt-[8px]">
            <span tw="text-[#0cc0aa]">${formatCost(tokensSaved, 3)}</span>
            <span tw="text-[#a1a1a1]"> saved @ $3/M input tokens</span>
          </div>
        </>
      )}
    </div>
  )
}

async function getTokensSaved(env: Cloudflare.Env, db: Database, urlParam?: string) {
  const hostname = urlParam
    ? new URL(/^https?:\/\//.test(urlParam) ? urlParam : `https://${urlParam}`).hostname
    : undefined
  const cacheKey = hostname
    ? (`stats:tokens_saved:${hostname}` as const)
    : ('stats:tokens_saved' as const)
  const cached = await env.KV.get(cacheKey, 'json')
  if (cached !== null) return cached

  const total = await (async () => {
    const query = db.selectFrom('request').select(requestTokensSavedSumSql().as('total'))
    const result = await (
      hostname ? query.where('hostname', '=', hostname) : query
    ).executeTakeFirstOrThrow()
    return result.total ?? 0
  })()
  waitUntil(env.KV.put(cacheKey, String(total), { expirationTtl: 60 }))
  return total
}

export async function render(request: Request, env: Cloudflare.Env, db: Database, query: query) {
  const [{ ImageResponse }, module, element, font, fontBold] = await Promise.all([
    import('@takumi-rs/image-response/wasm'),
    import('@takumi-rs/wasm/takumi_wasm_bg.wasm'),
    getElement(env.HOST, env, db, query),
    loadFont(request, env, '/fonts/GeistMono-Regular.ttf'),
    loadFont(request, env, '/fonts/GeistMono-Black.ttf'),
  ])
  return new ImageResponse(element, {
    fonts: [
      { data: font, name: 'Geist Mono' },
      { data: fontBold, name: 'Geist Mono' },
    ],
    format: 'png',
    headers: {
      'cache-control': query.page === 'url' ? 'public, max-age=3600' : 'public, max-age=300',
    },
    height: 630,
    module,
    width: 1200,
  })
}

async function loadFont(request: Request, env: Cloudflare.Env, path: string) {
  const url = new URL(path, request.url)
  return env.ASSETS.fetch(url).then((r) => r.arrayBuffer())
}
