<p>
  <a href="https://curl.md">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="../public/dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="../public/light.svg">
      <img src="../public/light.svg" alt="curl.md" height="40" style="width: auto;">
    </picture>
  </a>
  <br>
</p>

### URL to markdown for agents.

Turn websites into **optimized, low token output** to **supercharge your context**. Works with **every agent**.

---

## Quick Start

```sh
# Just use `curl`
curl curl.md/example.com

# Install CLI
curl -fsSL https://curl.md/install.sh | bash
npm i -g curl.md
bun i -g curl.md

# Use CLI via `curl.md` or short `md` alias
curl.md example.com
md example.com

# Add to your agent
claude plugin marketplace add wevm/curl.md
claude plugin install curl-md@curl-md
opencode plugin -g @curl.md/opencode
pi install npm:@curl.md/pi
npx @curl.md/amp install

# Add skills
npx skills add https://curl.md --yes

# Try it in your browser
open https://curl.md/example.com

# Use the SDK in your apps
import { createClient } from "curl.md"
const client = createClient()
const res = await client.fetch("example.com")
```

## Documentation

For full documentation, visit [curl.md/docs](https://curl.md/docs).

## Community

For help, discussion about best practices, or feature ideas:

[Discuss curl.md on GitHub](https://github.com/wevm/curl.md/discussions)

## Contributing

If you're interested in contributing to curl.md, please read our [contributing docs](https://curl.md/docs/dev/develop) **before submitting a pull request**.

## License

[MIT](../LICENSE)
