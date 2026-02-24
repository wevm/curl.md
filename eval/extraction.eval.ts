import { evalite } from 'evalite'
import * as scorer from './scorers.ts'
import { baseUrl } from './utils.ts'

evalite('extraction', {
  data: () => [
    // GitHub API docs
    {
      input: {
        url: 'https://docs.github.com/en/rest/repos/repos',
        objective: 'how to create a repository',
      },
    },
    {
      input: {
        url: 'https://docs.github.com/en/rest/pulls/pulls',
        objective: 'how to merge a pull request',
      },
    },
    {
      input: {
        url: 'https://docs.github.com/en/rest/issues/issues',
        objective: 'how to list issues for a repository',
      },
    },
    {
      input: {
        url: 'https://docs.github.com/en/rest/actions/workflows',
        objective: 'how to trigger a workflow dispatch',
      },
    },
    {
      input: {
        url: 'https://docs.github.com/en/rest/git/refs',
        objective: 'how to create a git reference',
      },
    },

    // MDN Web docs
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status',
        objective: 'what are 4xx client error status codes',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type',
        objective: 'what is the content-type header',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch',
        objective: 'how to use the fetch API',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
        objective: 'how to use Promise.all',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
        objective: 'how does array map work',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/display',
        objective: 'what values can display have',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSocket',
        objective: 'how to open a websocket connection',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
        objective: 'what is a preflight request',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/URL',
        objective: 'how to parse a URL',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import',
        objective: 'how to use dynamic imports',
      },
    },

    // React docs
    {
      input: {
        url: 'https://react.dev/reference/react/useState',
        objective: 'how to update state based on previous state',
      },
    },
    {
      input: {
        url: 'https://react.dev/reference/react/useEffect',
        objective: 'how to clean up an effect',
      },
    },
    {
      input: {
        url: 'https://react.dev/reference/react/useRef',
        objective: 'how to access a DOM node',
      },
    },
    {
      input: {
        url: 'https://react.dev/reference/react/useMemo',
        objective: 'when should I use useMemo',
      },
    },
    {
      input: {
        url: 'https://react.dev/reference/react/useContext',
        objective: 'how to pass data deeply with context',
      },
    },
    {
      input: {
        url: 'https://react.dev/reference/react/Suspense',
        objective: 'how does Suspense work with loading states',
      },
    },
    {
      input: {
        url: 'https://react.dev/learn/thinking-in-react',
        objective: 'what are the steps to think in react',
      },
    },

    // Node.js docs
    {
      input: {
        url: 'https://nodejs.org/api/fs.html',
        objective: 'how to read a file',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/path.html',
        objective: 'how to join paths',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/child_process.html',
        objective: 'how to spawn a child process',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/stream.html',
        objective: 'what are readable streams',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/http.html',
        objective: 'how to create an HTTP server',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/events.html',
        objective: 'how to use event emitters',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/crypto.html',
        objective: 'how to hash a string',
      },
    },
    {
      input: {
        url: 'https://nodejs.org/api/buffer.html',
        objective: 'how to create a buffer from a string',
      },
    },

    // TypeScript docs
    {
      input: {
        url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
        objective: 'how to use generic constraints',
      },
    },
    {
      input: {
        url: 'https://www.typescriptlang.org/docs/handbook/2/types-from-types.html',
        objective: 'what are mapped types',
      },
    },
    {
      input: {
        url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html',
        objective: 'how does type narrowing work',
      },
    },
    {
      input: {
        url: 'https://www.typescriptlang.org/docs/handbook/2/conditional-types.html',
        objective: 'how do conditional types work',
      },
    },
    {
      input: {
        url: 'https://www.typescriptlang.org/docs/handbook/utility-types.html',
        objective: 'what is the Partial utility type',
      },
    },

    // Python docs
    {
      input: {
        url: 'https://docs.python.org/3/library/json.html',
        objective: 'how to parse JSON in python',
      },
    },
    {
      input: {
        url: 'https://docs.python.org/3/library/asyncio.html',
        objective: 'how to run async code',
      },
    },
    {
      input: {
        url: 'https://docs.python.org/3/library/pathlib.html',
        objective: 'how to work with file paths',
      },
    },
    {
      input: {
        url: 'https://docs.python.org/3/library/re.html',
        objective: 'how to match a pattern with regex',
      },
    },
    {
      input: {
        url: 'https://docs.python.org/3/library/collections.html',
        objective: 'what is a defaultdict',
      },
    },

    // Rust docs
    {
      input: {
        url: 'https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html',
        objective: 'what is ownership in rust',
      },
    },
    {
      input: {
        url: 'https://doc.rust-lang.org/book/ch10-02-traits.html',
        objective: 'how to define a trait',
      },
    },
    {
      input: {
        url: 'https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html',
        objective: 'how to handle errors with Result',
      },
    },
    {
      input: {
        url: 'https://doc.rust-lang.org/book/ch16-01-threads.html',
        objective: 'how to create threads in rust',
      },
    },
    {
      input: {
        url: 'https://doc.rust-lang.org/book/ch06-02-match.html',
        objective: 'how to use match expressions',
      },
    },

    // Go docs
    {
      input: {
        url: 'https://go.dev/doc/effective_go',
        objective: 'how do goroutines work',
      },
    },
    {
      input: {
        url: 'https://go.dev/doc/effective_go',
        objective: 'how to use channels',
      },
    },
    {
      input: {
        url: 'https://go.dev/doc/effective_go',
        objective: 'how to handle errors in go',
      },
    },

    // Cloudflare docs
    {
      input: {
        url: 'https://developers.cloudflare.com/workers/runtime-apis/kv/',
        objective: 'how to put a value in KV',
      },
    },
    {
      input: {
        url: 'https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/',
        objective: 'what is the fetch handler',
      },
    },
    {
      input: {
        url: 'https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/',
        objective: 'how to run a SQL query with D1',
      },
    },
    {
      input: {
        url: 'https://developers.cloudflare.com/r2/api/workers/workers-api-usage/',
        objective: 'how to upload an object to R2',
      },
    },
    {
      input: {
        url: 'https://developers.cloudflare.com/workers/runtime-apis/cache/',
        objective: 'how to use the cache API',
      },
    },

    // Tailwind CSS docs
    {
      input: {
        url: 'https://tailwindcss.com/docs/display',
        objective: 'how to make an element flex',
      },
    },
    {
      input: {
        url: 'https://tailwindcss.com/docs/responsive-design',
        objective: 'how do responsive breakpoints work',
      },
    },
    {
      input: {
        url: 'https://tailwindcss.com/docs/dark-mode',
        objective: 'how to use dark mode',
      },
    },
    {
      input: {
        url: 'https://tailwindcss.com/docs/hover-focus-and-other-states',
        objective: 'how to style on hover',
      },
    },

    // Vite docs
    {
      input: {
        url: 'https://vite.dev/config/',
        objective: 'how to configure the dev server port',
      },
    },
    {
      input: {
        url: 'https://vite.dev/guide/env-and-mode',
        objective: 'how to use environment variables',
      },
    },
    {
      input: {
        url: 'https://vite.dev/guide/features',
        objective: 'how does CSS modules work in vite',
      },
    },

    // Stripe docs
    {
      input: {
        url: 'https://docs.stripe.com/api/charges',
        objective: 'how to create a charge',
      },
    },
    {
      input: {
        url: 'https://docs.stripe.com/api/customers',
        objective: 'how to create a customer',
      },
    },
    {
      input: {
        url: 'https://docs.stripe.com/webhooks',
        objective: 'how to verify webhook signatures',
      },
    },

    // Vercel docs
    {
      input: {
        url: 'https://vercel.com/docs/functions',
        objective: 'how to create a serverless function',
      },
    },

    // SQLite docs
    {
      input: {
        url: 'https://www.sqlite.org/lang_createtable.html',
        objective: 'how to create a table with a primary key',
      },
    },
    {
      input: {
        url: 'https://www.sqlite.org/lang_insert.html',
        objective: 'how to insert or replace rows',
      },
    },
    {
      input: {
        url: 'https://www.sqlite.org/wal.html',
        objective: 'what is write-ahead logging',
      },
    },

    // Docker docs
    {
      input: {
        url: 'https://docs.docker.com/compose/how-tos/networking/',
        objective: 'how does docker compose networking work',
      },
    },
    {
      input: {
        url: 'https://docs.docker.com/reference/dockerfile/',
        objective: 'how to use multi-stage builds',
      },
    },

    // Vitest docs
    {
      input: {
        url: 'https://vitest.dev/api/',
        objective: 'how to mock a module',
      },
    },
    {
      input: {
        url: 'https://vitest.dev/api/',
        objective: 'how to use test fixtures',
      },
    },

    // Next.js docs
    {
      input: {
        url: 'https://nextjs.org/docs/app/getting-started/layouts-and-pages',
        objective: 'how does file-based routing work',
      },
    },
    {
      input: {
        url: 'https://nextjs.org/docs/app/getting-started/fetching-data',
        objective: 'how to fetch data in server components',
      },
    },
    {
      input: {
        url: 'https://nextjs.org/docs/app/api-reference/functions/cookies',
        objective: 'how to read cookies',
      },
    },

    // Hono docs
    {
      input: {
        url: 'https://hono.dev/docs/getting-started/cloudflare-workers',
        objective: 'how to set up hono with cloudflare workers',
      },
    },
    {
      input: {
        url: 'https://hono.dev/docs/api/routing',
        objective: 'how to define routes in hono',
      },
    },

    // Zod docs
    {
      input: {
        url: 'https://zod.dev/',
        objective: 'how to define an object schema',
      },
    },
    {
      input: {
        url: 'https://zod.dev/',
        objective: 'how to validate and parse data',
      },
    },

    // Prettier docs
    {
      input: {
        url: 'https://prettier.io/docs/options',
        objective: 'what formatting options are available',
      },
    },

    // ESLint docs
    {
      input: {
        url: 'https://eslint.org/docs/latest/use/configure/',
        objective: 'how to configure eslint flat config',
      },
    },

    // PostgreSQL docs
    {
      input: {
        url: 'https://www.postgresql.org/docs/current/sql-select.html',
        objective: 'how to use WHERE clause',
      },
    },
    {
      input: {
        url: 'https://www.postgresql.org/docs/current/tutorial-join.html',
        objective: 'how to join tables',
      },
    },

    // Redis docs
    {
      input: {
        url: 'https://redis.io/docs/latest/commands/set/',
        objective: 'how to set a key with expiration',
      },
    },
    {
      input: {
        url: 'https://redis.io/docs/latest/develop/data-types/',
        objective: 'what data types does redis support',
      },
    },

    // Web APIs
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API',
        objective: 'what is a service worker',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API',
        objective: 'how to create a web worker',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Streams_API',
        objective: 'how to use readable streams',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/FormData',
        objective: 'how to construct form data',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/AbortController',
        objective: 'how to cancel a fetch request',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/structuredClone',
        objective: 'how to deep clone an object',
      },
    },
    {
      input: {
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID',
        objective: 'how to generate a UUID',
      },
    },

    // Git docs
    {
      input: {
        url: 'https://git-scm.com/docs/git-rebase',
        objective: 'how to do interactive rebase',
      },
    },
    {
      input: {
        url: 'https://git-scm.com/docs/git-stash',
        objective: 'how to stash changes',
      },
    },
    {
      input: {
        url: 'https://git-scm.com/docs/git-cherry-pick',
        objective: 'how to cherry pick a commit',
      },
    },

    // Biome docs
    {
      input: {
        url: 'https://biomejs.dev/linter/',
        objective: 'how to configure linter rules',
      },
    },

    // npm docs
    {
      input: {
        url: 'https://docs.npmjs.com/cli/v10/commands/npm-publish',
        objective: 'how to publish a package',
      },
    },
  ],
  task: async (input) => {
    const params = new URLSearchParams({ q: input.objective })
    const res = await fetch(`${baseUrl}/${input.url}?${params.toString()}`)
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.text()
  },
  scorers: [
    scorer.balancedCodeFences,
    scorer.lengthInRange,
    scorer.linkHygiene,
    scorer.lowBoilerplate,
    scorer.lowRepetition,
    scorer.noHtmlTags,
    scorer.noJunkLines,
    scorer.nonEmpty,
    scorer.notMostlyHeadings,
    scorer.relevance,
  ],
})
