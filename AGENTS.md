# AGENTS.md

Agent guidance for this repository.

> **Communication Style**: Be brief, concise. Maximize information density, minimize tokens. Incomplete sentences acceptable when clear. Remove filler words. Prioritize clarity over grammar.

## Commands

- `pnpm check` - Lint with Biome
- `pnpm check:types` - Type check with tsgo
- `pnpm gen:types` - Generate Cloudflare worker types

## Debugging

App runs in Docker via `docker compose up`. Use these to debug:

- `docker logs curl` - View app logs (add `-f` to follow)
- `docker compose exec app sh` - Shell into container
- Use Playwright MCP to visually debug the app at `https://curl.local` (navigate, snapshot, screenshot, interact with elements, network requests, console logs)

## Cloudflare Workers

- Follow [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/index.md)

## Content

- `src/lib/self-markdown.ts` is a rough markdown approximation of the home page (`src/routes/index.tsx`). Keep them roughly in sync when updating home page content.

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

## React Components

- Type `Props` MUST be inlined unless used elsewhere
- Do NOT destructure props in the function signature; destructure on the next line instead
  - Bad: `function MyComponent({ foo, bar }: { foo: string; bar: number }) { ... }`
  - Good: `function MyComponent(props: { foo: string; bar: number }) { const { foo, bar } = props; ... }`
- Server functions should go below component
- Use `React.PropsWithChildren` over `{ children: React.ReactNode }`

## UI

- **Tailwind CSS v4** - Use `@import "tailwindcss"` in CSS; utility classes in components
  - Use logical properties for RTL/LTR support (e.g. `ms-4`/`me-4` instead of `ml-4`/`mr-4`, `start-2`/`end-2` instead of `left-2`/`right-2`)
  - Do NOT concatenate class names for conditional styles. Use `data-*` attributes with Tailwind's `data-[...]` variant instead (e.g., `data-[active]:bg-blue9` + `data-active={cond ? '' : undefined}`)
