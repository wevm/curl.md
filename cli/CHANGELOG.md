# curl.md

## 0.0.12

### Patch Changes

- Bumped internal deps

## 0.0.11

### Patch Changes

- Update UI

## 0.0.10

### Patch Changes

- Added API key authentication via `--token` option and `CURLMD_API_KEY` environment variable. Invalid API keys now return a clear error with a CTA to create a new token.

## 0.0.9

### Patch Changes

- Added SDK, bumped CLI deps. ([`2afc602`](https://github.com/wevm/curl.md/commit/2afc6021178404d352ec7694310e8c1f732e550d))

## 0.0.8

### Patch Changes

- Fixed `update` command failing with 404 due to malformed download URL. ([`47022d4`](https://github.com/wevm/curl.md/commit/47022d44fc55caaf38aca154f8ba8acc7d87016e))

## 0.0.7

### Patch Changes

- Added `credits` command group for prepaid credit management (`credits add`, `credits check`). Rate limit errors now suggest `credits add` for authenticated users. ([`2043e19`](https://github.com/wevm/curl.md/commit/2043e19ba248a3d60cf7b61561dddf83ecb5b05c))

## 0.0.6

### Patch Changes

- Added `org invite` command group for organization invite management (`org invite accept`, `org invite create`, `org invite list`, `org invite revoke`). ([#18](https://github.com/wevm/curl.md/pull/18))

- Added `org member` command group for organization member management (`org member add`, `org member list`, `org member remove`, `org member role`). ([`bf88f63`](https://github.com/wevm/curl.md/commit/bf88f6380a32164912f28f82f4c0fbe82b2c4b05))

## 0.0.5

### Patch Changes

- Added `token` command group for API token management (`token create`, `token list`, `token delete`). ([#16](https://github.com/wevm/curl.md/pull/16))

## 0.0.4

### Patch Changes

- Added better error handling ([`c9d851f`](https://github.com/wevm/curl.md/commit/c9d851f786da111c6d8dfe925613b095a9d5cdaa))

## 0.0.3

### Patch Changes

- Bumped incur version ([`46411dd`](https://github.com/wevm/curl.md/commit/46411ddf2b24e220088a2c01d21adaddc8113301))

## 0.0.2

### Patch Changes

- Added update command ([`456dcad`](https://github.com/wevm/curl.md/commit/456dcade9249d68c0f555463792bdac5935033f9))

- Switched to [incur](https://github.com/wevm/incur) for CLI ([`e3d540f`](https://github.com/wevm/curl.md/commit/e3d540f14aa50cf03efcccdad41684b3dbf9a584))

## 0.0.1

### Patch Changes

- Initial release ([`c7d9ccd`](https://github.com/wevm/curl.md/commit/c7d9ccda398710e6da8cb052cf49d510568871a2))
