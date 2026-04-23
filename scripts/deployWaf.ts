// Deploys Cloudflare WAF custom rules to block bot-probed file extensions and paths.
// Run: pnpm node --experimental-strip-types scripts/waf.ts

import { z } from 'zod'

const env = z.parse(z.object({ CLOUDFLARE_API_TOKEN: z.string() }), process.env)

const extensions = [
  '.action',
  '.asp',
  '.aspx',
  '.cgi',
  '.css',
  '.env',
  '.eot',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.jsx',
  '.map',
  '.php',
  '.png',
  '.svg',
  '.ts',
  '.tsx',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
  '.xml',
  '.yaml',
  '.yml',
]

const botPaths = [
  '/.env',
  '/.git',
  '/actuator',
  '/cgi-bin',
  '/info.php',
  '/phpmyadmin',
  '/telescope',
  '/wordpress',
  '/wp-',
  '/xmlrpc',
]

const excludePrefixes = ['/assets/', '/.well-known/']
const excludePaths = ['/api/og.png', '/claude.json', '/dark.svg', '/favicon.svg', '/light.svg']

const expression = [
  `(${[
    ...excludePrefixes.map((p) => `not starts_with(http.request.uri.path, "${p}")`),
    ...excludePaths.map((p) => `http.request.uri.path ne "${p}"`),
  ].join(
    ' and ',
  )} and (${extensions.map((ext) => `ends_with(http.request.uri.path, "${ext}")`).join(' or ')}))`,
  ...botPaths.map((path) => `starts_with(http.request.uri.path, "${path}")`),
].join(' or ')

const headers = {
  Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
  'Content-Type': 'application/json',
}

console.log('Fetching zone ID for curl.md')
const zoneRes = await cfetch('https://api.cloudflare.com/client/v4/zones?name=curl.md', { headers })
const zone = z.parse(
  z.object({
    result: z.tuple([z.object({ id: z.string(), account: z.object({ id: z.string() }) })]),
  }),
  zoneRes,
)
const zoneId = zone.result[0].id
const accountId = zone.result[0].account.id

console.log(`Account ID: ${accountId}`)
console.log(`Zone ID: ${zoneId}`)
console.log(`Deploying WAF rule (${extensions.length} extensions, ${botPaths.length} bot paths)`)
const data = await cfetch(
  `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`,
  {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      rules: [
        {
          expression,
          action: 'block',
          description: 'Block bot-probed file extensions',
          enabled: true,
        },
      ],
    }),
  },
)
const rule = z.parse(
  z.object({ result: z.object({ rules: z.array(z.object({ id: z.string() })) }) }),
  data,
)

console.log(`Deployed WAF rule (${extensions.length} extensions, ${botPaths.length} bot paths)`)
console.log(`Rule ID: ${rule.result.rules[0]?.id}`)
console.log(`https://dash.cloudflare.com/${accountId}/curl.md/security/waf/custom-rules`)

async function cfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const json = z.parse(
    z.looseObject({
      success: z.boolean(),
      errors: z.array(z.object({ code: z.number(), message: z.string() })).optional(),
    }),
    await res.json(),
  )
  if (!json.success) {
    console.error(`Cloudflare API error (${res.status}):`, JSON.stringify(json.errors, null, 2))
    process.exit(1)
  }
  return json
}
