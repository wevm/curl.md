---
description: Use when you need markdown from a public URL, docs page, article, or changelog.
---

Use `curl_md` to fetch the URL or domain in `$ARGUMENTS` or the surrounding conversation.

Guidelines:

- Prefer the canonical docs or article URL.
- Set `objective` when the user asks a specific question.
- Set `keywords` for long pages when only a few sections matter.
- Use `mode: "smart"` for long or noisy pages, `mode: "rush"` when the relevant section is already obvious.
- Set `fresh: true` when freshness matters, such as changelogs, release notes, pricing, or recently updated docs.

After fetching, answer the user directly instead of restating the tool output verbatim.
