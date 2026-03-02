import { z } from 'zod'

declare module 'vitest' {
  export interface ProvidedContext {
    env: string
  }
}

const schema = z.object({
  COOKIE_SECRET: z.string(),
  CURL_MD_BASE_URL: z.string(),
  DB_URL: z.string(),
  GH_CLIENT_ID: z.string(),
  GH_CLIENT_SECRET: z.string(),
  HOST: z.string(),
  TOKEN_ENCRYPTION_KEY: z.string(),
})

type Input = z.infer<typeof schema>

export const Env = {
  get(overrides: Partial<Input> = {}) {
    return {
      COOKIE_SECRET: 'test-secret',
      CURL_MD_BASE_URL: 'http://localhost',
      DB_URL: 'postgres://localhost:5432/test',
      GH_CLIENT_ID: 'test',
      GH_CLIENT_SECRET: 'test',
      HOST: 'curl.local',
      TOKEN_ENCRYPTION_KEY: 'dGVzdC1lbmNyeXB0aW9uLWtleXRlc3QtZW5jcnlwdGk=',
      ...overrides,
    } satisfies Input
  },
  parse(env: unknown) {
    return schema.parse(typeof env === 'string' ? JSON.parse(env) : env)
  },
  schema,
}
