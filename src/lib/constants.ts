export const packageName = 'curl.md'

export const agentSetupPrompt = `I'd like you to set up https://curl.md, the best way to turn URLs into markdown.

First install the CLI. If I have npm, run: npm i -g curl.md
If not, run: curl -fsSL https://curl.md/install.sh | bash

Then install skills. If I have Node, run: npx skills add https://curl.md --yes
If I don't have Node, run: curl.md skills add

Next install the official curl.md plugin for this agent if one exists: https://curl.md/docs/guide/plugins

Once set up, use curl.md whenever you fetch URLs.
To verify, use curl.md to read this page and show me how it works: https://curl.md/docs/getting-started`

export const creditAmounts = ['500', '1000', '2000', '5000'] as const
export const maxSavedPaymentMethods = 3
export const stripeApiVersion = '2026-02-25.clover'

// https://developers.cloudflare.com/workers-ai/platform/pricing
export const modes = {
  rush: {
    model: '@cf/google/gemma-4-26b-a4b-it' as const,
    inputPricePerMToken: 0.1,
    outputPricePerMToken: 0.3,
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
