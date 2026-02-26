import { env } from 'cloudflare:workers'
import handler from '@tanstack/react-start/server-entry'
import { getDb } from '#lib/db.ts'

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    switch (path) {
      case '/llms.txt':
      case '/skills':
      case '/.well-known/skills':
      case '/.well-known/skills/curl-md':
        return env.ASSETS.fetch(new URL(skillsAssets[path] ?? path, url))
    }
    if (
      url.pathname.length > 1 &&
      isSocialCrawler(request.headers.get('user-agent') ?? '')
    )
      return socialCrawlerResponse(url)
    return handler.fetch(request, { context: { ctx, env, request } })
  },
  queue: async (batch) => {
    const db = getDb()
    for (const message of batch.messages) {
      const { markdownLength, requestId, url } = message.body
      try {
        const res = await fetch(url, {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': `Mozilla/5.0 (compatible; ${env.HOST}/1.0; +https://${env.HOST})`,
          },
          redirect: 'follow',
        })
        if (!res.ok) {
          message.ack()
          continue
        }
        const html = await res.text()
        const tokensSaved = Math.round((html.length - markdownLength) / 4)
        await db
          .updateTable('request')
          .set({ tokens_saved: tokensSaved })
          .where('id', '=', requestId)
          .execute()
        await env.KV.delete('stats:tokens_saved')
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<
  Env,
  Parameters<Env['TOKEN_UPDATE_QUEUE']['send']>[0]
>

const socialCrawlerRe =
  /Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot/i

function isSocialCrawler(ua: string) {
  return socialCrawlerRe.test(ua)
}

function socialCrawlerResponse(url: URL) {
  const raw = url.pathname.slice(1)
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const ogUrl = `https://${__HOST__}/og.png?url=${encodeURIComponent(raw)}`
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
<meta property="og:title" content="${__HOST__}/${escaped}" />
<meta property="og:description" content="Fetch any URL as Markdown" />
<meta property="og:image" content="${ogUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://${__HOST__}/${escaped}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${__HOST__}/${escaped}" />
<meta name="twitter:description" content="Fetch any URL as Markdown" />
<meta name="twitter:image" content="${ogUrl}" />
</head>
<body></body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

const skillsAssets: Record<string, string> = {
  '/skills': '/.well-known/skills/index.json',
  '/.well-known/skills': '/.well-known/skills/index.json',
  '/.well-known/skills/curl-md': '/.well-known/skills/curl-md/SKILL.md',
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: {
        ctx: ExecutionContext
        env: Env
        request: Request
      }
    }
  }
}
