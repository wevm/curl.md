# @curl.md/amp

Amp plugin for `curl.md`.

## Install

```sh
pnpm dlx @curl.md/amp install
```

## Notes

- Requires the Amp CLI plugin API and `PLUGINS=all`.
- Installs the package into `~/.config/amp` and creates `~/.config/amp/plugins/curlmd.ts`.
- Auth supports `CURLMD_API_KEY`, otherwise it reuses local `curl.md auth login` state when available.
- Main tool: `read_web_page` (`md_fetch` alias).
