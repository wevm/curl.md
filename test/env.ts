import { z } from 'zod'

declare module 'vitest' {
  export interface ProvidedContext {
    env: string
  }
}

const schema = z.object({
  COOKIE_SECRET: z.string(),
  DB_URL: z.string(),
  GH_CLIENT_ID: z.string(),
  GH_CLIENT_SECRET: z.string(),
  HOST: z.string(),
})

type Input = z.infer<typeof schema>

export const Env = {
  get(dbUrl: string) {
    return {
      COOKIE_SECRET: 'test-secret',
      DB_URL: dbUrl,
      GH_CLIENT_ID: 'test',
      GH_CLIENT_SECRET: 'test',
      HOST: 'curl.local',
    } satisfies Input
  },
  parse(env: unknown) {
    return schema.parse(typeof env === 'string' ? JSON.parse(env) : env)
  },
  schema,
}
