import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

const pluginRoot = path.resolve(import.meta.dirname, '..')
const marketplaceJsonPath = path.resolve(pluginRoot, '../../public/claude.json')
const packageJsonPath = path.join(pluginRoot, 'package.json')
const pluginJsonPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json')
const redirectScriptPath = path.join(pluginRoot, 'scripts', 'redirect-webfetch.sh')

test('marketplace manifest stays in sync with package and plugin metadata', () => {
  const marketplaceJson = JSON.parse(readFileSync(marketplaceJsonPath, 'utf8')) as {
    name?: string
    owner?: { name: string }
    plugins?: Array<Record<string, unknown>>
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    name?: string
    version?: string
  }
  const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8')) as {
    author?: { name: string }
    description?: string
    homepage?: string
    license?: string
    name?: string
    repository?: string
    version?: string
  }

  expect(pluginJson.version).toBe(packageJson.version)
  expect(marketplaceJson).toEqual({
    name: pluginJson.name,
    owner: pluginJson.author,
    plugins: [
      {
        author: pluginJson.author,
        description: pluginJson.description,
        homepage: pluginJson.homepage,
        license: pluginJson.license,
        name: pluginJson.name,
        repository: pluginJson.repository,
        source: {
          package: packageJson.name,
          source: 'npm',
        },
        version: packageJson.version,
      },
    ],
  })
})

test('plugin manifest registers the opt-in WebFetch redirect hook', () => {
  const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8')) as {
    hooks?: {
      PreToolUse?: Array<{
        hooks?: Array<{ command?: string; type?: string }>
        matcher?: string
      }>
    }
    userConfig?: {
      webfetch_redirect?: {
        default?: boolean
        description?: string
        title?: string
        type?: string
      }
    }
  }

  expect(pluginJson.hooks?.PreToolUse).toEqual([
    {
      hooks: [
        {
          command: 'sh "${CLAUDE_PLUGIN_ROOT}/scripts/redirect-webfetch.sh"',
          type: 'command',
        },
      ],
      matcher: 'WebFetch',
    },
  ])
  expect(pluginJson.userConfig?.webfetch_redirect).toEqual({
    default: false,
    description:
      "Block Claude Code's built-in WebFetch tool and tell Claude to retry with curl_md.",
    title: 'Redirect WebFetch to curl_md',
    type: 'boolean',
  })
})

test('WebFetch redirect hook stays inert by default', () => {
  const stdout = execFileSync('sh', [redirectScriptPath], {
    encoding: 'utf8',
    env: process.env,
    input:
      '{"tool_name":"WebFetch","tool_input":{"prompt":"Summarize the page","url":"https://example.com"}}\n',
  })

  expect(stdout).toBe('')
})

test('WebFetch redirect hook blocks WebFetch when opt-in is enabled', () => {
  const stdout = execFileSync('sh', [redirectScriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_OPTION_webfetch_redirect: 'true',
    },
    input:
      '{"tool_name":"WebFetch","tool_input":{"prompt":"Summarize the page","url":"https://example.com"}}\n',
  })

  expect(JSON.parse(stdout)).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Use curl_md instead of WebFetch for URL reads. Retry this request with curl_md using the same url, and map the WebFetch prompt to curl_md objective.',
    },
  })
})
