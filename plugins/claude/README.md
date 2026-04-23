<p>
  <a href="https://curl.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/wevm/curl.md/main/public/dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/wevm/curl.md/main/public/light.svg">
      <img src="https://raw.githubusercontent.com/wevm/curl.md/main/public/light.svg" alt="curl.md" height="40" style="width: auto;">
    </picture>
  </a>
  <br>
</p>

# @curl.md/claude

Turn websites into **optimized, low token output** inside **Claude Code**.

## Install

```sh
claude plugin marketplace add https://curl.md/claude.json
claude plugin install curl-md@curl-md
```

Use `curl-md` as the marketplace/plugin name in install commands, `/curl-md:fetch` as the slash skill, and `curl_md` as the MCP tool name shown in Claude.

Then reload plugins or restart Claude Code.

```text
/reload-plugins
```

## Use

Use Claude normally and paste a URL, or run the plugin skill directly:

```text
/curl-md:fetch https://curl.md/docs/plugins/claude
```

## Notes

- First launch installs plugin runtime dependencies with `npm`, so Node/npm must be on your `PATH`.
- For higher limits, set `CURLMD_API_KEY` or run `curl.md auth login`.

## Documentation

For full documentation, visit [curl.md/docs](https://curl.md/docs/plugins/claude)

## License

[MIT](https://github.com/wevm/curl.md/blob/main/LICENSE)
