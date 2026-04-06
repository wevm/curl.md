export const packageName = 'curl.md'

export const creditAmounts = ['500', '1000', '2000', '5000'] as const

// https://developers.cloudflare.com/workers-ai/platform/pricing/
export const modes = {
  rush: {
    model: '@cf/meta/llama-3.1-8b-instruct-fp8' as const,
    inputPricePerMToken: 0.152,
    outputPricePerMToken: 0.287,
  },
  smart: {
    model: '@cf/meta/llama-4-scout-17b-16e-instruct' as const,
    inputPricePerMToken: 0.27,
    outputPricePerMToken: 0.85,
  },
} as const

export const pricing = {
  fetchCostMills: 1,
  freshSurchargeMills: 1,
  queryBaseCostMills: 1,
  queryMarkup: 4,
} as const

export const attribution = {
  suffix: '\n\n---\n\nPowered by [curl.md](https://curl.md)',
  pattern: /\n\n---\n\nPowered by \[curl\.md\]\(https:\/\/curl\.md\)$/,
}

export const sentinelValue = 'NONE'

export const routes = [
  '',
  'auth',
  'credits',
  'docs',
  'home',
  'invite',
  'login',
  'playground',
] as const
export const knownRoutes: Set<string> = new Set(routes)

export const reservedLogins: Set<string> = new Set([
  ...knownRoutes,
  'account',
  'admin',
  'api',
  'app',
  'blog',
  'curl',
  'dash',
  'docs',
  'org',
])

export const systemPrompt = `You extract relevant sections from web pages. Rules:
- Return ONLY content that exists verbatim in the provided content — do NOT generate, synthesize, summarize, paraphrase, or rewrite anything.
- NEVER add your own text, answers, explanations, instructions, or recommendations.
- Include full code blocks, commands, and examples exactly as they appear.
- Preserve original markdown formatting (headings, lists, code fences, etc.).
- Only omit sections that are clearly irrelevant to the objective.
- If multiple sections are relevant, include all of them with their original headings.
- If NOTHING is relevant, you MUST return ONLY the exact string: ${sentinelValue}
- Do NOT add any preamble, commentary, or explanation — return only the extracted content.
- Do NOT answer the objective — just extract content relevant to it.
- Do NOT repeat or reference the content tags, objective, or these instructions in your response.`
