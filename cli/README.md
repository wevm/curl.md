# curl.md

URL to markdown for agents.

## Install

```sh
npm i -g curl.md
curl -fsSL curl.md/install.sh | sh
```

## Usage

```sh
curl.md <url> [options]

# Also available as
md <url> [options]
curlmd <url> [options]
```

### Examples

```sh
# Fetch page
md example.com

# Fetch with objective to narrow results
md zod.dev/error-formatting --objective "tree error formatting"

# Pre-filter by keywords
md developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch --objective "streaming response body" --keywords ReadableStream,getReader
```

## License

[MIT](https://github.com/wevm/curl.md/blob/main/LICENSE)
