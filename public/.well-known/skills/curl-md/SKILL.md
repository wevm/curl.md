---
name: curl-md
description: Fetch any URL as markdown using curl.md. Use when the user needs to read, summarize, or extract content from a web page as markdown.
---

# curl.md

Fetch any URL as clean markdown.

## When to Use

Use curl.md when:

- The user asks to read, summarize, or extract content from a web page
- You need to fetch documentation before answering a technical question
- The user shares a URL and asks about its content
- You need to research a topic using a specific web source
- The user asks "what does this page say about X"

## Usage

```sh
# Fetch a URL as markdown
curl curl.md/<url>

# Focus output with a query (AI-powered extraction)
curl curl.md/<url>?q=<query>

# Bypass cache for fresh content
curl curl.md/<url>?fresh=
```

### Parameters

| Parameter | Description                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `q`       | Optional query to extract only relevant sections from the page using AI. Reduces output size and keeps responses focused. |
| `fresh`   | Bypass the 15-minute cache to fetch the latest content.                                                                   |

No protocol needed — `curl curl.md/example.com` automatically uses HTTPS.

## Examples

```sh
# Get React docs as markdown
curl curl.md/react.dev

# Get focused content
curl curl.md/react.dev?q=fullstack+support

# Wikipedia article section
curl curl.md/en.wikipedia.org/wiki/Linux?q=kernel+history

# GitHub REST API docs
curl curl.md/docs.github.com/en/rest?q=rate+limiting

# Bypass cache for a fast-changing page
curl curl.md/status.example.com?fresh
```

## Tips

- **Use `?q=` to reduce token usage.** Without it, you get the entire page. With it, only relevant sections are returned verbatim.
- **Pipe to tools** for further processing: `curl curl.md/example.com | head -100`
- **Known doc sites** (like Cloudflare, Vercel, Bun, PlanetScale) are fetched as native markdown for higher quality output.
- **Content is cached for 15 minutes.** Use `?fresh` if you need the latest version.

## Limitations

- Pages that require JavaScript rendering (SPAs without SSR) may return incomplete content.
- Paywalled or authenticated content is not accessible.
- Very large pages are truncated to ~100k characters when using `?q=`.
- Returns JSON `{ "error": "..." }` if the upstream site returns an error.

## MCP Server

An MCP server is also available with a `fetch_page` tool:

```sh
npx add-mcp curl.md/mcp
```

### `fetch_page` Tool

| Parameter | Type   | Required | Description                                                                    |
| --------- | ------ | -------- | ------------------------------------------------------------------------------ |
| `url`     | string | Yes      | URL of the web page to fetch (e.g. `"https://example.com"` or `"example.com"`) |
| `query`   | string | No       | Query to narrow down the returned content to relevant sections                 |
