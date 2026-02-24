import { createScorer } from 'evalite'
import { aiRun } from './utils.ts'

type Input = { url: string; objective: string }
type Expected = undefined

export const balancedCodeFences = createScorer<Input, string, Expected>({
  name: 'Balanced code fences',
  description: 'Ensure ``` fences are properly opened/closed',
  scorer: ({ output }) => {
    const fences = output.match(/^```/gm)?.length ?? 0
    return fences % 2 === 0 ? 1 : 0
  },
})

export const lengthInRange = createScorer<Input, string, Expected>({
  name: 'Length in range',
  description:
    'Penalize outputs that are too short or too long (whole-page dumps)',
  scorer: ({ output }) => {
    const len = output.trim().length
    const min = 300
    const max = 8000
    if (len === 0) return 0
    if (len >= min && len <= max) return 1
    if (len < min) return Math.max(0, len / min)
    return Math.max(0, max / len)
  },
})

export const linkHygiene = createScorer<Input, string, Expected>({
  name: 'Link hygiene',
  description: 'No broken/JS links in markdown output',
  scorer: ({ output }) => {
    const text = stripCode(output)
    const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) =>
      m[1].trim(),
    )
    const bad = links.filter(
      (h) =>
        h === '' ||
        h === '#' ||
        /^javascript:/i.test(h) ||
        /void\(0\)/i.test(h),
    )
    return bad.length > 0 ? 0 : 1
  },
})

export const lowBoilerplate = createScorer<Input, string, Expected>({
  name: 'Low boilerplate',
  description: 'Penalize common navigation/footer/cookie/feedback text',
  scorer: ({ output }) => {
    const text = stripCode(output).toLowerCase()
    const badPhrases = [
      'skip to content',
      'table of contents',
      'on this page',
      'edit this page',
      'was this helpful',
      'cookie',
      'privacy policy',
      'terms of service',
      'sign in',
      'newsletter',
      'copyright',
      'all rights reserved',
    ]
    const hits = badPhrases.reduce(
      (acc, p) => acc + (text.includes(p) ? 1 : 0),
      0,
    )
    if (hits === 0) return 1
    if (hits >= 4) return 0
    return 1 - hits / 4
  },
})

export const lowRepetition = createScorer<Input, string, Expected>({
  name: 'Low repetition',
  description: 'Penalize repeated lines (common in nav or sidebar extraction)',
  scorer: ({ output }) => {
    const lines = stripCode(output)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 20)
    if (lines.length <= 3) return 1
    const unique = new Set(lines.map((l) => l.toLowerCase()))
    const ratio = unique.size / lines.length
    if (ratio >= 0.75) return 1
    if (ratio <= 0.5) return 0
    return (ratio - 0.5) / (0.75 - 0.5)
  },
})

export const noHtmlTags = createScorer<Input, string, Expected>({
  name: 'No HTML tags',
  description: 'Output does not contain raw HTML tags outside code blocks',
  scorer: ({ output }) => {
    const withoutCode = stripCode(output)
    return /<[a-z][a-z0-9]*[\s>]/i.test(withoutCode) ? 0 : 1
  },
})

export const noJunkLines = createScorer<Input, string, Expected>({
  name: 'No junk lines',
  description:
    'Detect minified JS/CSS/garbage by excessively long lines outside code blocks',
  scorer: ({ output }) => {
    const text = stripCode(output)
    const tooLong = text.split('\n').some((l) => l.length > 600)
    return tooLong ? 0 : 1
  },
})

export const nonEmpty = createScorer<Input, string, Expected>({
  name: 'Non-empty',
  description: 'Output is not empty',
  scorer: ({ output }) => (output.trim().length > 0 ? 1 : 0),
})

export const notMostlyHeadings = createScorer<Input, string, Expected>({
  name: 'Not mostly headings',
  description:
    'Penalize outputs that are mostly headings/outline with little body content',
  scorer: ({ output }) => {
    const text = stripCode(output)
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return 0
    const headings = lines.filter((l) => /^#{1,6}\s+/.test(l)).length
    const body = lines.length - headings
    if (body >= headings) return 1
    const ratio = body / Math.max(1, headings)
    if (ratio <= 0.25) return 0
    if (ratio >= 1) return 1
    return (ratio - 0.25) / (1 - 0.25)
  },
})

export const relevance = createScorer<Input, string, Expected>({
  name: 'Relevance',
  description: 'LLM judges whether extracted content answers the objective',
  scorer: async ({ input, output }) => {
    const text = output.slice(0, 4000)
    const response = await aiRun('@cf/meta/llama-4-scout-17b-16e-instruct', {
      max_tokens: 256,
      messages: [
        {
          role: 'system',
          content: `You are an evaluator. Given an objective and extracted content, rate how relevant the content is to the objective.
Respond with ONLY a JSON object: {"score": <0.0-1.0>, "rationale": "<brief reason>"}
- 1.0 = content directly and thoroughly addresses the objective
- 0.5 = content is partially relevant but missing key information
- 0.0 = content is irrelevant to the objective`,
        },
        {
          role: 'user',
          content: `Objective: ${input.objective}\n\nExtracted content:\n${text}`,
        },
      ],
    })
    try {
      const json =
        typeof response === 'string'
          ? JSON.parse(response.replace(/```json?\n?|\n?```/g, '').trim())
          : response
      return {
        score: Math.max(0, Math.min(1, json.score)),
        metadata: { rationale: json.rationale },
      }
    } catch {
      return 0.5
    }
  },
})

function stripCode(output: string) {
  return output.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '')
}
