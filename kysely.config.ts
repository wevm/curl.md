import { defineConfig, getKnexTimestampPrefix } from 'kysely-ctl'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { z } from 'zod'

const env = z.parse(z.object({ DB_URL: z.string() }), process.env)

export default defineConfig({
  dialect: new PostgresJSDialect({
    postgres: postgres(env.DB_URL),
  }),
  migrations: {
    getMigrationPrefix: getKnexTimestampPrefix,
  },
})
