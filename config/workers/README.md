# Workers Test Workspace

Separate workspace for Cloudflare Workers integration tests using `@cloudflare/vitest-pool-workers`.

This exists because `@cloudflare/vitest-pool-workers` doesn't support vitest v4 yet.

- https://github.com/cloudflare/workers-sdk/issues/11064
- https://github.com/cloudflare/workers-sdk/pull/11632

Test files use the `*.workers.test.ts` convention and live alongside source files (e.g., `src/api.workers.test.ts`).

## Once pool workers supports vitest v4

1. Delete `config/workers/` workspace and `config/tsconfig.workers.json`
2. Inline the workers vitest project into root `vitest.config.ts`
3. Add `cloudflare:test` types to `config/tsconfig.app.json`
4. Remove the `*.workers.test.ts` exclude from `config/tsconfig.app.json` and `vitest.config.ts`
5. Keep `scripts/strip-global-props.ts` — it's still needed (see below)

## `scripts/strip-global-props.ts`

Wrangler generates `GlobalProps { mainModule: typeof import("./entry-server") }` in `worker-configuration.d.ts`, which creates a transitive type dependency on the entire app. This makes `worker-configuration.d.ts` impossible to include in any tsconfig that doesn't have the full app context (`@tanstack/react-start`, vite defines, etc.).

The post-processor strips `GlobalProps` so `Cloudflare.Env` types can be used independently.

- https://github.com/cloudflare/workers-sdk/issues/11454

Remove the post-processor once that issue is fixed upstream.
