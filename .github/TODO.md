# TODO

- Remove `find ../src ../db -name '*.js' -delete` from `cli/package.json` build script once tsgo supports scoping emit to `rootDir` only. Currently tsgo emits `.js` files into `../src` and `../db` because they're pulled in transitively via `#` import aliases. See https://github.com/microsoft/typescript-go/issues/2708
