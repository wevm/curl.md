# AGENTS.md

Agent guidance for this repository.

> **Communication Style**: Be brief, concise. Maximize information density, minimize tokens. Incomplete sentences acceptable when clear. Remove filler words. Prioritize clarity over grammar.

## Commands

Prefer running these scripts instead of using `npx`. Use `pnpm` over `npx` for running binaries.

- `pnpm check` - Lint and format with oxlint + oxfmt
- `pnpm check:deps` - Check for unused dependencies with Knip (cli/ only)
- `pnpm check:types` - Type check with tsgo
- `pnpm db:codegen` - Generate database types
- `pnpm db:migrate latest` - Run database migrations
- `pnpm gen:fixtures:md:rules` - Re-fetch live sources for `src/md/rules` fixture tests
  - Run `pnpm vitest --config test/vitest.config.ts --project md run src/md/ --update` after to update snapshots
- `pnpm gen:types` - Generate Cloudflare worker types
- `pnpm test` - Run tests with Vitest (includes all projects)
- `pnpm test --project name` - Always try to scope tests to specific projects when possible
- `pnpm test:e2e` - Run E2E tests with Playwright

## Debugging

App runs in Docker via `docker compose up`. Use these to debug:

- `docker logs curl` - View app logs (add `-f` to follow)
- `pnpm db:command "SQL"` - Run SQL against local DB
- `docker compose exec app sh` - Shell into container
- Use `agent-browser` to visually debug the app at `https://curl.local` (navigate, snapshot, screenshot, interact with elements, network requests, console logs)

## API (Hono RPC)

- Always specify explicit status codes in `c.json()` responses (e.g., `c.json({ error: 'not_found' }, 404)`, `c.json({ data }, 200)`)
- Use `res.status` to narrow response types on the client instead of `'error' in data` checks
- Prefer route-level error responses over global middleware errors — keeps RPC types precise per-endpoint
- Use string literal error codes in API responses (e.g., `'organization_access_denied'`, `'expired_token'`) for type-safe client matching
- Use `validator()` from `#lib/hono.ts` (not `@hono/zod-validator` directly) — it formats validation errors as `{ error: 'validation_error', issues: [{ path, message }] }`
- Add `if (false as boolean) return validationError(c)` as the first line in validated handlers to include the 400 response in RPC types (validator middleware handles it at runtime, but Hono doesn't type middleware responses)

## Cloudflare Workers

- Follow [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/index.md)

## Database

Follow [PlanetScale Postgres skill](https://github.com/planetscale/database-skills/tree/main/skills/postgres) for general Postgres best practices (schema design, indexing, query patterns, optimization).

- Use singular table names (`account` instead of `accounts`)
- Use timestamps (like `deleted_at`) instead of boolean fields (`deleted`)
- Use CHECK constraints instead of Postgres ENUMs for enum-like columns
- When adding enum-like TEXT columns (with a fixed set of values), add them to `customTypes` in `db/codegen.ts`
- Use `DB.<table>` types from `db/types.gen.ts` for database record types. When only a subset of fields is needed, use `Pick<DB.<table>, "field1" | "field2">` instead of defining custom types.
- Prefer snake_case field names when data originates from the database (e.g., `credential_id` not `credentialId`)
- Naming conventions:
  - Tables: singular snake_case (`account`, `api_key`)
  - Columns: singular snake_case (`created_at`, `account_id`)
  - Indexes: `{table}_{column}_idx`
  - Unique constraints: `{table}_{column(s)}_uq`
  - Check constraints: `{table}_{column}_chk`
  - Foreign keys: `{table}_{column}_fkey`

## Naming

- Avoid hyphens in command names, route paths, and identifiers — they break double-click-to-select

## Code Style

- Component/page component should be the first thing in the file (after imports)
- Use IIFE when appropriate
- No braces for single-branch statements (`if (true) return ...`)
- No ellipsis in button text (e.g. "Deleting" not "Deleting...")
- No emoji
- Alphabetize imports, keys, props, etc.
- Inline code; extract only when reused across files
- Use `#` package.json import prefix (e.g., `#lib/auth.ts`, `#db/client.ts`)
- Use `.ts`/`.tsx` extensions in imports (`allowImportingTsExtensions`)
- Place internal non-exported functions at the bottom of the file
- Prefer "account" over "user" in naming (variables, types, functions, etc.)
- Don't destructure unless necessary (e.g. prefer `const json = c.req.valid('json')` over `const { name, slug } = c.req.valid('json')`)
- Avoid creating variables for basic things unless necessary (e.g. prefer using `c.var.db` over `const db = c.var.db`)
- Use rpc $url() method for type-safe url generation instead of hardcoding strings

## Tests

- Don't use `describe` blocks unless required

## React Components

- Type `Props` MUST be inlined unless used elsewhere
- Do NOT destructure props in the function signature; destructure on the next line instead
  - Bad: `function MyComponent({ foo, bar }: { foo: string; bar: number }) { ... }`
  - Good: `function MyComponent(props: { foo: string; bar: number }) { const { foo, bar } = props; ... }`
- Server functions should go below component
- Use `React.PropsWithChildren` over `{ children: React.ReactNode }`
- **Shared components** use namespace pattern: define private functions, export a single const object (e.g., `export const Nav = { Group, Logo, Root, Skip }`). Import as `import { Nav } from '#components/Nav.tsx'`, use as `<Nav.Root>`. See `Dialog.tsx`, `Dashboard.tsx`, `Nav.tsx` for examples.

## UI

- **Icons** - Auto-imported via unplugin-icons. Use `<Icon{Collection}{Name} />` (e.g., `<IconLucideArrowRight />`, `<IconOcticonMarkGithub />`).
- **Tailwind CSS v4** - Use `@import "tailwindcss"` in CSS; utility classes in components
  - Use logical properties for RTL/LTR support (e.g. `ms-4`/`me-4` instead of `ml-4`/`mr-4`, `start-2`/`end-2` instead of `left-2`/`right-2`)
  - Do NOT concatenate class names for conditional styles. Use `data-*` attributes with Tailwind's `data-[...]` variant instead (e.g., `data-[active]:bg-blue9` + `data-active={cond ? '' : undefined}`)

## Misc

- Repo/project-level README is located at `.github/README.md`
- Use `pnpm-workspace.yaml>overrides` instead of `package.json#pnpm.overrides`
- `.env` is used instead of `.dev.vars`
- Use `.github/TODO.md` for general TODOs not attached to specific files/lines
