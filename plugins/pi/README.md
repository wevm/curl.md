# @curl.md/pi

Pi extension for `curl.md`.

## Install

```sh
pi install @curl.md/pi
```

## Notes

- Works without the `curl.md` CLI.
- Auth supports `CURLMD_API_KEY`, otherwise it reuses local `curl.md auth login` state when available.
- Using the CLI is still recommended for `auth`, `org`, `token`, and `credits` workflows.
- Main tool: `read_web_page` (`md_fetch` alias).
