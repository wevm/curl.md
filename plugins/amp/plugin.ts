// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
import type { PluginAPI } from '@ampcode/plugin'

export default function (amp: PluginAPI) {
  amp.registerTool({
    name: 'curl_md',
    description:
      'Fetch a web page and return it as clean markdown. Supports objective-based filtering and keyword pre-filtering for large pages. Use this instead of read_web_page for better results.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        objective: { type: 'string', description: 'Narrow content to a specific objective' },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Pre-filter by keywords before objective narrowing',
        },
        mode: {
          type: 'string',
          enum: ['rush', 'smart'],
          description: 'Mode when narrowing with objective (default: smart)',
        },
        fresh: { type: 'boolean', description: 'Bypass cache and force fresh fetch' },
      },
      required: ['url'],
    },
    async execute(input) {
      const args = [input.url as string]
      if (input.objective) args.push('--objective', input.objective as string)
      if (input.keywords) args.push('--keywords', (input.keywords as string[]).join(','))
      if (input.mode) args.push('--mode', input.mode as string)
      if (input.fresh) args.push('--fresh')

      const result = await amp.$`curl.md ${args}`
      return result.exitCode === 0 ? result.stdout : result.stderr
    },
  })

  amp.on('tool.call', async (event, ctx) => {
    if (event.tool !== 'read_web_page') return { action: 'allow' }

    const args = [event.input.url as string]
    if (event.input.objective) args.push('--objective', event.input.objective as string)
    if (event.input.forceRefetch) args.push('--fresh')

    const result = await ctx.$`curl.md ${args}`
    return {
      action: 'synthesize',
      result: {
        output: result.exitCode === 0 ? result.stdout : result.stderr,
        exitCode: result.exitCode,
      },
    }
  })
}
