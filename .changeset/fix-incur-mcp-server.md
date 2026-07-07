---
'curl.md': patch
---

Bumped `incur` to `0.4.11` to fix a startup crash (`SyntaxError: ... does not provide an export named 'StdioServerTransport'`) caused by `incur@0.4.5`'s static root import of `StdioServerTransport` from `@modelcontextprotocol/server`, which moved that export to the `./stdio` subpath in `2.0.0-alpha.4` and later.
