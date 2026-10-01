# @motifx/compiler

The JSX compiler for [MotifJS](https://www.npmjs.com/package/@motifx/core). It lowers JSX at build time into fine-grained reactive bindings on real DOM nodes: `{state.name}` becomes a binding on that one text node, not a re-rendered tree.

It ships as a Vite plugin (also usable in Rollup) and two command-line tools.

## Install

```bash
npm install -D @motifx/compiler typescript
```

## Vite

```ts
import { defineConfig } from 'vite';
import compiler from '@motifx/compiler';

export default defineConfig({
    plugins: [compiler()],
    esbuild: { jsx: 'preserve' },
});
```

Set `"jsx": "preserve"` in `tsconfig.json` as well, so that only `@motifx/compiler` compiles JSX. Vitest picks up the same plugin from the Vite config.

## Rollup

The same plugin works in a plain Rollup build:

```js
import compiler from '@motifx/compiler';

export default {
    input: 'src/index.tsx',
    output: { dir: 'dist', format: 'esm' },
    plugins: [compiler()],
};
```

## Which files are compiled

Files ending in `.tsx`, `.jsx`, `.mtsx`, `.mjsx` or `.aio`. In `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files that contain decorators, only the standard (TC39) decorators are compiled, so `@Injectable` behaves the same in every file in `vite dev` and `vite build`. Files whose nearest `tsconfig.json` enables `experimentalDecorators`, `.d.ts` files and files under `node_modules` are left to Vite. Imports with a `?raw`, `?url`, `?worker`, `?sharedworker` or `?inline` query and virtual modules are left untouched.

## Options

```ts
compiler({
    diagnostics: true,
    explain: false,
});
```

| Option | Default | Description |
| --- | --- | --- |
| `diagnostics` | `true` | Print compiler warnings (`MJX001`–`MJX004`, `MJX007`) for patterns that compile but do not behave as they read. |
| `explain` | `false` | Print what every JSX expression was lowered to. `true` for all files, or a string / `RegExp` matched against the file path. |

## Command-line tools

```bash
npx motif-lint [--project tsconfig.json] [--json] [--no-fail] [file.tsx …]
```

Type-aware lint (`MJX005`): reports a ternary passed to a component prop whose declared type does not accept a getter. Exits with code 1 when there are findings (`--no-fail` to disable).

```bash
npx motif-explain src/App.tsx [more.tsx …] [--json] [--site child|attr|prop|…] [--code]
```

Shows the call each JSX expression compiles to, whether it is reactive, and what it depends on. `--code` also prints the full generated code.

Both tools are also available as functions: `lintProject`, `lintProgram`, `explain`, `printDiagnostics`, `printExplanations`, `formatExplanations`.

## Exports

The default export is the plugin function. Named exports: `Compiler` (`new Compiler().start(code, filename)` returns the Babel result, with `diagnostics` on the instance), `explain`, `lintProject`, `lintProgram`, `printDiagnostics`, `printExplanations`, `formatExplanations`, and the types `MotifVitePluginOptions`, `MotifDiagnostic`, `MotifExplanation`, `ExplainSite`, `ExplainReactivity` and `LintOptions`.

## Runtime contract

Compiled code calls into the `@motifx/core` runtime:

- the `motifComponent`, `motifFragment`, `FNComponent`, `motifCompiled`, `asyncTracking` and `Component` exports;
- component members: `bindings.*` (each binding directive `x-wait`, `x-display`, `x-model`, `x-text`, `x-html`, `x-value` and `x-watch` calls the method of the same name), `class.add`, `attr.add`, `style`, `motif.on`, `controls.add`, `setText`, and `navigate` on the frame passed to conditional branches;
- property keys: `runover`, `initializeComponent`, `preconfig`, `ref`, `childs`, `__childExpr`, `__isSvgElement`, `onRefCreated`, the lifecycle hook props that lifecycle directives become (`x-mounted` becomes `onmounted`), and the static class fields `elementTag` and `elementNamespace`.

This set is the compiler contract. It changes only in a major version, so `@motifx/compiler` 1.x works with any `@motifx/core` 1.x. Every compiled module calls `motifCompiled(<contract>)` once; in development the runtime warns with `MJX121` when the numbers differ, for example when a package that ships compiled JSX was built for another major version. The call is marked pure, so production builds drop it.

## License

[MIT](./LICENSE)
