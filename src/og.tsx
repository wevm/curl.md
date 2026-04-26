import { waitUntil } from 'cloudflare:workers'
import { z } from 'zod'
import type { Database } from '#db/client.ts'
import { requestTokensSavedSumSql } from '#db/utils.ts'

export const schema = z
  .discriminatedUnion('page', [
    z.object({
      description: z.string().optional(),
      page: z.literal('docs'),
      title: z.string(),
    }),
    z.object({ page: z.literal('index') }),
    z.object({ page: z.literal('playground') }),
    z.object({ page: z.literal('url'), url: z.string() }),
  ])
  .catch({ page: 'index' })

export type query = z.infer<typeof schema>

async function getElement(env: Cloudflare.Env, db: Database, query: query) {
  switch (query.page) {
    case 'docs': {
      return docsVariant(query.title)
    }
    case 'url': {
      const tokensSaved = await getTokensSaved(env, db, query.url)
      return urlVariant(query.url, tokensSaved)
    }
    case 'playground': {
      return playgroundVariant()
    }
    case 'index': {
      const tokensSaved = await getTokensSaved(env, db)
      return indexVariant(tokensSaved)
    }
  }
}

function docsVariant(title: string) {
  return (
    <div tw="relative flex flex-col w-full h-full bg-black text-[#ededed] font-[Geist_Mono] px-[72px] py-[64px]">
      <div tw="flex items-start justify-start">
        <BrandLogo />
      </div>
      <div tw="flex flex-1 pe-[96px] mt-[42px]">
        <div tw="text-[#ededed] text-[72px] leading-[1.15] font-bold tracking-[0.02em] text-left max-w-[1000px]">
          {title}
        </div>
      </div>
      <div tw="absolute right-0 bottom-[100px] left-0 h-0.5 bg-[#2c2c2c]" />
    </div>
  )
}

function indexVariant(tokensSaved: number) {
  return (
    <div tw="relative flex w-full h-full bg-black text-[#ededed] font-[Geist_Mono] px-[80px] py-[40px]">
      <div tw="flex flex-1 flex-col items-center justify-center">
        <BrandLogo height={56} width={772} />
        <div tw="text-[#a1a1a1] text-[54px] mt-[44px] text-center">URL to markdown for agents</div>
      </div>
      <div tw="absolute right-[80px] bottom-[40px] left-[80px] flex items-end justify-between">
        <div tw="text-[#a1a1a1] text-[36px] tracking-[0.08em] uppercase leading-none">
          tokens saved
        </div>
        <div tw="text-[#ededed] text-[36px] leading-none">{formatNumber(tokensSaved)}</div>
      </div>
    </div>
  )
}

function playgroundVariant() {
  return (
    <div tw="relative flex w-full h-full bg-black text-[#ededed] font-[Geist_Mono] px-[80px] py-[40px]">
      <div tw="flex flex-1 flex-col items-center justify-center">
        <BrandLogo height={56} width={772} />
        <div tw="text-[#a1a1a1] text-[54px] mt-[44px] text-center">playground</div>
      </div>
    </div>
  )
}

function urlVariant(urlParam: string, tokensSaved: number) {
  const hostname = new URL(/^https?:\/\//.test(urlParam) ? urlParam : `https://${urlParam}`)
    .hostname
  return (
    <div tw="relative flex w-full h-full bg-black text-[#ededed] font-[Geist_Mono] px-[80px] py-[40px]">
      <div tw="flex flex-1 flex-col items-center justify-center">
        <BrandLogo height={56} width={772} />
        <div tw="text-[#a1a1a1] text-[54px] mt-[44px] text-center">{hostname}</div>
      </div>
      <div tw="absolute right-[80px] bottom-[40px] left-[80px] flex items-end justify-between">
        <div tw="text-[#a1a1a1] text-[36px] tracking-[0.08em] uppercase leading-none">
          tokens saved
        </div>
        <div tw="text-[#ededed] text-[36px] leading-none">{formatNumber(tokensSaved)}</div>
      </div>
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
    getElement(env, db, query),
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
      'cache-control':
        query.page === 'url' || query.page === 'docs'
          ? 'public, max-age=3600'
          : 'public, max-age=300',
    },
    height: 630,
    module,
    width: 1200,
  })
}

function formatNumber(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

async function loadFont(request: Request, env: Cloudflare.Env, path: string) {
  const url = new URL(path, request.url)
  return env.ASSETS.fetch(url).then((r) => r.arrayBuffer())
}

function BrandLogo(props: { height?: number; width?: number }) {
  const { height = 28, width = 386 } = props

  return (
    <svg
      fill="none"
      height={height}
      viewBox="0 0 1104 80"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M48 32V16H16V0H48V16H64V32H48ZM16 80V64H0V16H16V64H48V80H16ZM48 64V48H64V64H48Z"
        fill="#fff"
      />
      <path d="M112 80V64H96V0H112V64H144V80H112ZM144 64V0H160V64H144Z" fill="#fff" />
      <path
        d="M192 80V0H240V16H256V32H240V64H256V80H240V64H224V48H208V80H192ZM208 32H239.36V16H208V32Z"
        fill="#fff"
      />
      <path d="M288 80V0H304V64H336V80H288Z" fill="#fff" />
      <path d="M368 80V64H384V80H368Z" fill="#fff" />
      <path
        d="M416 80V0H432V16H448V32H464V48H448V32H432V80H416ZM480 80V32H464V16H480V0H496V80H480Z"
        fill="#fff"
      />
      <path d="M528 80V0H576V16H592V64H576V80H528ZM544 64H575.36V16H544V64Z" fill="#fff" />
      <path d="M656 32V0H672V32H656ZM640 48V32H656V48H640ZM624 80V48H640V80H624Z" fill="#7D7D7D" />
      <path
        d="M736 16V0H752V16H736ZM720 32V16H736V32H720ZM736 80V64H720V48H704V32H720V48H736V64H752V80H736Z"
        fill="#7D7D7D"
      />
      <path d="M800 80V64H784V0H800V64H832V80H800ZM832 64V0H848V64H832Z" fill="#7D7D7D" />
      <path
        d="M880 80V0H928V16H944V32H928V64H944V80H928V64H912V48H896V80H880ZM896 32H927.36V16H896V32Z"
        fill="#7D7D7D"
      />
      <path d="M976 80V0H992V64H1024V80H976Z" fill="#7D7D7D" />
      <path
        d="M1088 48V32H1072V16H1056V0H1072V16H1088V32H1104V48H1088ZM1072 64V48H1088V64H1072ZM1056 80V64H1072V80H1056Z"
        fill="#7D7D7D"
      />
    </svg>
  )
}
