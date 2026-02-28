# AGENTS.md

Agent guidance for this repository.

> **Communication Style**: Be brief, concise. Maximize information density, minimize tokens. Incomplete sentences acceptable when clear. Remove filler words. Prioritize clarity over grammar.

## Commands

- `pnpm check` - Lint with Biome
- `pnpm check:types` - Type check with tsgo
- `pnpm db:codegen` - Generate database types
- `pnpm db:migrate` - Run database migrations
- `pnpm gen:types` - Generate Cloudflare worker types
- `pnpm test` - Run tests with Vitest (includes app, cli, workers, and pro projects)

## Debugging

App runs in Docker via `docker compose up`. Use these to debug:

- `docker logs curl` - View app logs (add `-f` to follow)
- `docker compose exec app pnpm db:command "SQL"` - Run SQL against local D1
- `docker compose exec app sh` - Shell into container
- Use Playwright MCP to visually debug the app at `https://curl.local` (navigate, snapshot, screenshot, interact with elements, network requests, console logs)

## Submodule Architecture

The `pro/` directory is a git submodule (`wevm/curl.md.pro`) containing pro/premium features. It is NOT required for development — the app works without it. If you don't have access to the private repo, the submodule will be absent and that's fine.

- Pro features live in `pro/`; basic/free functionality lives in the main repo
- Do not commit submodule pointer changes unless intentional
- When working on pro features, ensure the submodule is initialized (`git submodule update --init`)

## Cloudflare Workers

- Follow [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/index.md)

## Database

- Use singular table names (`account` instead of `accounts`)
- Use timestamps (like `deleted_at`) instead of boolean fields (`deleted`)
- When adding enum-like TEXT columns (with a fixed set of values), add them to `customTypes` in `scripts/db-codegen.ts`
- Use `DB.<table>` types from `src/lib/db.gen.ts` for database record types. When only a subset of fields is needed, use `Pick<DB.<table>, "field1" | "field2">` instead of defining custom types.
- Prefer snake_case field names when data originates from the database (e.g., `credential_id` not `credentialId`)

## Tools

- Prefer `mcp__curl_md__fetch_page` over `read_web_page` for fetching web pages.

## Code Style

- Component/page component should be the first thing in the file (after imports)
- Use IIFE when appropriate
- No braces for single-branch statements (`if (true) return ...`)
- No emoji
- Alphabetize imports, keys, props, etc.
- Inline code; extract only when reused across files
- Use `#` package.json import prefix (e.g., `#lib/auth.ts`)
- Use `.ts`/`.tsx` extensions in imports (`allowImportingTsExtensions`)
- Place internal non-exported functions at the bottom of the file
- Prefer "account" over "user" in naming (variables, types, functions, etc.)
- Don't destructure unless necessary (e.g. prefer `const json = c.req.valid('json')` over `const { name, slug } = c.req.valid('json')`)
- Avoid creating variables for basic things unless necessary (e.g. prefer using `c.var.db` over `const db = c.var.db`)

## Tests

- Don't use `describe` blocks unless required

## React Components

- Type `Props` MUST be inlined unless used elsewhere
- Do NOT destructure props in the function signature; destructure on the next line instead
  - Bad: `function MyComponent({ foo, bar }: { foo: string; bar: number }) { ... }`
  - Good: `function MyComponent(props: { foo: string; bar: number }) { const { foo, bar } = props; ... }`
- Server functions should go below component
- Use `React.PropsWithChildren` over `{ children: React.ReactNode }`

## UI

- **Icons** - Auto-imported via unplugin-icons. Use `<Icon{Collection}{Name} />` (e.g., `<IconLucideArrowRight />`, `<IconOcticonMarkGithub />`).
- **Tailwind CSS v4** - Use `@import "tailwindcss"` in CSS; utility classes in components
  - Use logical properties for RTL/LTR support (e.g. `ms-4`/`me-4` instead of `ml-4`/`mr-4`, `start-2`/`end-2` instead of `left-2`/`right-2`)
  - Do NOT concatenate class names for conditional styles. Use `data-*` attributes with Tailwind's `data-[...]` variant instead (e.g., `data-[active]:bg-blue9` + `data-active={cond ? '' : undefined}`)
