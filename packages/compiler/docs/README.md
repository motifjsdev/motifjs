# @motifx/compiler documentation

The full reference is in the [package README](../README.md). This page is a short map of what the package contains.

## Build plugin

The default export is the plugin. It works in Vite and in plain Rollup:

```ts
import { defineConfig } from 'vite';
import compiler from '@motifx/compiler';

export default defineConfig({
    plugins: [compiler()],
});
```

The plugin runs before Vite's own transform and leaves no JSX behind, so Vite needs no JSX setting; `"jsx": "preserve"` in `tsconfig.json` lets TypeScript type-check JSX without compiling it. It compiles `.tsx`, `.jsx`, `.mtsx`, `.mjsx` and `.aio` files, and the standard decorators in `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files (unless the nearest `tsconfig.json` enables `experimentalDecorators`).

Options:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `diagnostics` | `boolean` | `true` | Prints compile-time warnings (`MJX001`–`MJX004`, `MJX007`) with file and line. |
| `explain` | `boolean \| string \| RegExp` | off | Prints what each JSX expression was compiled into, for every file or for matching files. |

## Command-line tools

- `motif-lint` runs type-aware checks over a TypeScript project: `motif-lint [-p tsconfig.json] [--json] [--no-fail] [files…]`. It exits with 1 when it finds something, unless `--no-fail` is given.
- `motif-explain` shows how each JSX expression in the given files is compiled: `motif-explain <files…> [--site child|attr|prop|event|directive] [--json] [--code]`.

## Programmatic use

Named exports: `Compiler` (`new Compiler().start(code, filename)` returns the Babel result; warnings are on `compiler.diagnostics`), `explain`, `lintProject`, `lintProgram`, `printDiagnostics`, `printExplanations` and `formatExplanations`.

## Versions

Compiled code calls into `@motifx/core`. Use the same major version of both packages.
