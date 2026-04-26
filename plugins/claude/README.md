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

# @curl.md/amp - URL to markdown for Claude

Turn websites into **optimized, low token output** to **supercharge your context**.

## Install

```sh
claude plugin marketplace add https://curl.md/claude.json
claude plugin install curl-md@curl-md
```

To update:

```sh
claude plugin marketplace update curl-md
claude plugin install curl-md@curl-md
```

## Documentation

For full documentation, visit [curl.md/docs](https://curl.md/docs/plugins/claude)

## Optional WebFetch Redirect

Enable the plugin's `webfetch_redirect` setting to block built-in `WebFetch` calls and nudge Claude to retry with the plugin's `curl_md` tool.

## License

[MIT](https://github.com/wevm/curl.md/blob/main/LICENSE)
