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

### URL to markdown for agents

Turn websites into **optimized, low token output** to **supercharge your context**. Works with **every agent**.

## Install

```sh
curl -fsSL https://curl.md/install.sh | bash
npm i -g curl.md
bun i -g curl.md
```

## Usage

Use `curl.md` or via the short `md` alias.

```sh
curl.md example.com
md example.com
```

## SDK

Use the SDK in your apps

```sh
npm i curl.md
pnpm i curl.md
bun i curl.md
yarn add curl.md
```

```ts
import { createClient } from 'curl.md'
const client = createClient()
const res = await client.fetch('example.com')
```

## Documentation

For full documentation, visit [curl.md/docs](https://curl.md/docs/guide/cli)

## License

[MIT](https://github.com/wevm/curl.md/blob/main/LICENSE)
