import { defineConfig, getKnexTimestampPrefix } from 'kysely-ctl'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { z } from 'zod'

const env = z.parse(z.object({ DB_URL: z.string() }), process.env)
const dbUrl = new URL(env.DB_URL)
dbUrl.searchParams.delete('sslrootcert')

export default defineConfig({
  dialect: new PostgresJSDialect({
    postgres: postgres(dbUrl.toString()),
  }),
  migrations: {
    getMigrationPrefix: getKnexTimestampPrefix,
  },
})
