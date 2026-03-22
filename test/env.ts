import { z } from 'zod'

declare module 'vitest' {
  export interface ProvidedContext {
    env: string
  }
}

const schema = z.object({
  COOKIE_SECRET: z.string(),
  CURLMD_BASE_URL: z.string(),
  DB_URL: z.string(),
  GH_API_URL: z.string(),
  GH_CLIENT_ID: z.string(),
  GH_CLIENT_SECRET: z.string(),
  GH_URL: z.string(),
  HOST: z.string(),
  SENTRY_DSN: z.string(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  TOKEN_ENCRYPTION_KEY: z.string(),
})

type Input = z.infer<typeof schema>

export const Env = {
  get(overrides: Partial<Input> = {}) {
    return {
      COOKIE_SECRET: 'test-secret',
      CURLMD_BASE_URL: 'http://localhost',
      DB_URL: 'postgres://localhost:5432/test',
      GH_API_URL: 'https://api.github.com',
      GH_CLIENT_ID: 'test',
      GH_CLIENT_SECRET: 'test',
      GH_URL: 'https://github.com',
      HOST: 'curl.local',
      SENTRY_DSN: 'https://key@o123.ingest.us.sentry.io/456',
      STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
      TOKEN_ENCRYPTION_KEY: 'dGVzdC1lbmNyeXB0aW9uLWtleXRlc3QtZW5jcnlwdGk=',
      ...overrides,
    } satisfies Input
  },
  parse(env: unknown) {
    return schema.parse(typeof env === 'string' ? JSON.parse(env) : env)
  },
  schema,
}
