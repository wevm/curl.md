export const baseUrl = process.env.EVAL_BASE_URL ?? 'https://curl.local'

export async function aiRun(
  model: string,
  body: { messages: { role: string; content: string }[]; max_tokens?: number },
) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken)
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN')
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(`AI API ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { result: { response: string } }
  return json.result.response
}
