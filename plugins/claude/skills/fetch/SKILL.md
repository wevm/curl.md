---
description: Use curl.md when you need to read a public URL, docs page, changelog, article, or blog post with low-token markdown output.
---

Use the `curl_md` tool to fetch the URL or domain in `$ARGUMENTS` or in the surrounding conversation.

Guidelines:

- Prefer the canonical docs or article URL.
- Set `objective` when the user asks a specific question.
- Set `keywords` for long pages when only a few sections matter.
- Use `mode: "smart"` for long or noisy pages, `mode: "rush"` when the relevant section is already obvious.
- Set `fresh: true` when freshness matters, such as changelogs, release notes, pricing, or recently updated docs.

After fetching, answer the user directly instead of restating the tool output verbatim.
