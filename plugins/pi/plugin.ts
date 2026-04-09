import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StringEnum } from '@mariozechner/pi-ai'
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateHead,
  type ExtensionAPI,
} from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'

const curlMdParams = Type.Object({
  fresh: Type.Optional(Type.Boolean({ description: 'Bypass cache and force fresh fetch' })),
  keywords: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Pre-filter by keywords before objective narrowing',
    }),
  ),
  mode: Type.Optional(StringEnum(['rush', 'smart'] as const)),
  objective: Type.Optional(Type.String({ description: 'Narrow content to a specific objective' })),
  url: Type.String({ description: 'URL to fetch' }),
})

interface CurlMdDetails {
  exitCode: number
  fullOutputPath?: string
  truncation?: TruncationResult
  url: string
}

const webReadingInstruction =
  'When the user asks to read, fetch, open, browse, summarize, or extract content from a web page or HTTP(S) URL, prefer the curl_md tool instead of bash, curl, or wget. Use read only for local files.'

export default function (pi: ExtensionAPI) {
  pi.on('before_agent_start', async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${webReadingInstruction}`,
  }))

  pi.registerTool({
    name: 'curl_md',
    label: 'curl.md',
    description: `Fetch a web page and return it as clean markdown using curl.md. Supports objective-based filtering and keyword pre-filtering. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first). Full output is saved to a temp file when truncated.`,
    promptSnippet: 'Fetch a web page as markdown with optional objective-based narrowing.',
    promptGuidelines: [
      'Use curl_md when you need readable web content instead of shelling out to curl directly.',
      'Pass objective and keywords for large pages to narrow the returned content before it reaches the model.',
    ],
    parameters: curlMdParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const args = [params.url]
      if (params.objective) args.push('--objective', params.objective)
      if (params.keywords?.length) args.push('--keywords', params.keywords.join(','))
      if (params.mode) args.push('--mode', params.mode)
      if (params.fresh) args.push('--fresh')

      const result = await pi.exec('curl.md', args, {
        cwd: ctx.cwd,
        signal,
        timeout: 60_000,
      })

      if (result.code !== 0) {
        const message =
          result.stderr.trim() || result.stdout.trim() || `curl.md exited with code ${result.code}`
        throw new Error(message)
      }

      const output = result.stdout || '(no output)'
      const truncation = truncateHead(output, {
        maxBytes: DEFAULT_MAX_BYTES,
        maxLines: DEFAULT_MAX_LINES,
      })
      const details: CurlMdDetails = {
        exitCode: result.code,
        url: params.url,
      }
      let text = truncation.content || '(no output)'

      if (truncation.truncated) {
        const tempDir = await mkdtemp(join(tmpdir(), 'pi-curlmd-'))
        const tempFile = join(tempDir, 'output.md')
        await writeFile(tempFile, output, 'utf8')
        details.fullOutputPath = tempFile
        details.truncation = truncation
        text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${tempFile}]`
      }

      return {
        content: [{ type: 'text', text }],
        details,
      }
    },
  })
}
