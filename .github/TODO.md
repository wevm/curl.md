# TODO

- Remove `find ../src ../db -name '*.js' -delete` from `cli/package.json` build script once tsgo supports scoping emit to `rootDir` only. Currently tsgo emits `.js` files into `../src` and `../db` because they're pulled in transitively via `#` import aliases. See https://github.com/microsoft/typescript-go/issues/2708

- Investigate intermittent preview deploy race in [run 24106079433](https://github.com/wevm/curl.md/actions/runs/24106079433): PlanetScale preview branch was created, but Hyperdrive setup failed with `Connection closed unexpectedly by the database server [code: 2015]` and migrations failed with `no primary available for branch ...`. Likely fix: wait for preview DB readiness after branch creation in `.github/workflows/preview_deploy.yml` before Hyperdrive/migrations.

- Remove the temporary TanStack Router pnpm patches in [pnpm-workspace.yaml](file:///Users/tmm/Developer/curl.md/pnpm-workspace.yaml) once [TanStack/router PR #7116](https://github.com/TanStack/router/pull/7116) is merged and released. Re-run `pnpm test:e2e test/e2e/dashboard.test.ts` after dropping them.
- Switch to `cf` CLI for preview workflows https://blog.cloudflare.com/cf-cli-local-explorer/
- Add anchor-aware content narrowing for fetched markdown: narrow by heading slug in `src/md/chunk.ts` using the same slug rules as `src/lib/docs.ts`, apply anchor narrowing before keyword/objective filtering, and add `anchor` to derived-content cache keys once that behavior is enabled.
