import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

const pluginRoot = path.resolve(import.meta.dirname, '..')
const redirectScriptPath = path.join(pluginRoot, 'scripts', 'redirect-webfetch.sh')

test('plugin manifest passes Claude validation', () => {
  const claudeBinPath = path.join(
    pluginRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'claude.cmd' : 'claude',
  )

  const stdout = execFileSync(claudeBinPath, ['plugin', 'validate', '.'], {
    cwd: pluginRoot,
    encoding: 'utf8',
  })

  expect(stdout).toContain('Validation passed')
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

test('marketplace manifest stays in sync with package and plugin metadata', () => {
  const packageJsonPath = path.join(pluginRoot, 'package.json')
  const marketplaceJsonPath = path.resolve(pluginRoot, '../../public/claude.json')
  const pluginJsonPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json')

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
