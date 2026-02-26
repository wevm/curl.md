export function selfMarkdown() {
  const host = __HOST__
  return `---
title: curl.md
description: Fetch any URL as Markdown
---

# curl.md

Fetch any URL as Markdown

\`\`\`sh
# Fetch a URL
curl https://${host}/example.com

# Install agent skill
npx curl.md skills add

# Install MCP server (cli)
npx curl.md mcp add

# Install MCP server (remote)
npx add-mcp ${host}/mcp
\`\`\`

## Usage

\`\`\`sh
# Filter by objective
curl https://${host}/example.com?q=pricing

# Filter by keywords
curl https://${host}/example.com?k=api,auth

# Combine both
curl "https://${host}/example.com?q=authentication&k=oauth,jwt"
\`\`\`

### Examples

\`\`\`sh
# GitHub webhook payloads
curl "https://${host}/docs.github.com/en/webhooks/webhook-events-and-payloads?q=pull+request+webhook+event+payload+and+actions&k=pull_request,pull+request"

# Vercel MCP setup for Claude Code
curl "https://${host}/vercel.com/docs/agent-resources/vercel-mcp?q=how+do+i+install+for+claude+code&k=claude+code"

# MDN Fetch API streaming
curl "https://${host}/developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch?q=streaming+response+body&k=ReadableStream,getReader"

# Cloudflare D1 from a Worker
curl "https://${host}/developers.cloudflare.com/d1/get-started?q=how+to+query+D1+from+a+worker&k=D1,bindings"

# Cloudflare Workers database connections
curl "https://${host}/developers.cloudflare.com/workers/databases/connecting-to-databases?q=how+do+i+connect+to+d1+with+planetscale&k=d1,planetscale"

# AI SDK text streaming
curl "https://${host}/ai-sdk.dev/docs/ai-sdk-core/generating-text?q=how+to+stream+text+with+the+ai+sdk&k=streamText,generateText"
\`\`\`

## CLI

\`\`\`sh
# Run with npx
npx curl.md example.com

# Or install globally
npm i -g curl.md

# Filter by objective
curl.md example.com -q "pricing plans"

# Filter by keywords
curl.md example.com -k "api,auth"

# Combine both
curl.md example.com -q "authentication" -k "oauth,jwt"

# Pipe from stdin
echo "example.com" | curl.md

# Show all options
curl.md --help
\`\`\`

## Links

- [GitHub](https://github.com/wevm/curl.md)
- [Playground](https://${host}/playground)
- [X](https://x.com/wevm_dev)
- [llms.txt](https://${host}/llms.txt)
- [Skill](https://${host}/skills)
- [MCP server](https://${host}/mcp)
`
}
