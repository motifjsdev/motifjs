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
});
```

The plugin runs before Vite's own transform (`enforce: 'pre'`) and leaves no JSX behind, so Vite needs no JSX setting. Set `"jsx": "preserve"` in `tsconfig.json` so that TypeScript type-checks JSX without compiling it. Vitest picks up the same plugin from the Vite config.

## Rollup

The same plugin works in a plain Rollup build:

```js
import compiler from '@motifx/compiler';
import esbuild from 'rollup-plugin-esbuild';
import resolve from '@rollup/plugin-node-resolve';

const production = !process.env.ROLLUP_WATCH;

export default {
    input: 'src/index.tsx',
    output: { dir: 'dist', format: 'esm' },
    plugins: [
        compiler({ production }),
        esbuild(),
        resolve({ extensions: ['.tsx', '.ts', '.mjs', '.js'] }),
    ],
};
```

The plugin removes the types from the `.tsx` and `.jsx` files it compiles. Plain `.ts` files still need a TypeScript plugin (`rollup-plugin-esbuild` here, or `@rollup/plugin-typescript`), and imports written without an extension or by package name need `@rollup/plugin-node-resolve` with the `.tsx` and `.ts` extensions.

Rollup has no mode of its own, so `production` tells the plugin that this is a production build. Without it, the plugin treats the build as production when `NODE_ENV` is `production`.

## Which files are compiled

Files ending in `.tsx`, `.jsx`, `.mtsx`, `.mjsx` or `.aio`. In `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files that contain decorators, only the standard (TC39) decorators are compiled, so `@Injectable` behaves the same in every file in `vite dev` and `vite build`. Files whose nearest `tsconfig.json` enables `experimentalDecorators`, `.d.ts` files and files under `node_modules` are left to Vite. Imports with a `?raw`, `?url`, `?worker`, `?sharedworker` or `?inline` query and virtual modules are left untouched.

While developing (`storeNames`), module-level stores are named for DevTools: in `.ts`, `.tsx`, `.js` and `.jsx` files outside `node_modules`, every top-level `const` or `let` whose value comes from `reactive`, `useModel`, `createSignal`, `createComputed` or `createLazyComputed` of `@motifx/core` is followed by a call that gives the store its variable name and its file. A production build adds nothing.

## Development-only code

A production build removes the code marked for development only, in your own files and in packages under `node_modules`. MotifJS marks its DevTools hooks this way, so they never reach a production bundle, whether or not the app calls `app.useDevelopment(true)`.

```ts
/* @DEV-ONLY */ console.log('built', this);

/* @DEV-ONLY-BEGIN */
const probe = createProbe(app);
probe.attach();
/* @DEV-ONLY-END */
```

`/* @DEV-ONLY */` removes the statement that follows it. `/* @DEV-ONLY-BEGIN */` and `/* @DEV-ONLY-END */` remove everything between them together with the two comments: statements, imports and declarations, or members inside a class body. A marker is a block comment that contains only the marker; a line comment that mentions it is not a marker. A range begins and ends in the same block. A `BEGIN` without its `END`, an `END` without its `BEGIN`, a `BEGIN` inside another range or a range marker inside an expression stops the build with an error that points at the marker, while developing as well.

Nothing is removed while developing. A production build is `vite build` in Vite, and in Rollup the `production` option or `NODE_ENV=production`.

## Options

```ts
compiler({
    diagnostics: true,
    explain: false,
    exclude: undefined,
    storeNames: undefined,
    production: undefined,
});
```

| Option | Default | Description |
| --- | --- | --- |
| `diagnostics` | `true` | Print compiler warnings (`MJX001`–`MJX004`, `MJX007`, `MJX015`) for patterns that compile but do not behave as they read. `MJX015` (a class component override that does not reach `super` on every path) is also checked in `.ts` / `.js` files. |
| `explain` | `false` | Print what every JSX expression was lowered to. `true` for all files, or a string / `RegExp` matched against the file path. |
| `exclude` | unset | Files the plugin leaves alone: a string matched with `includes` against the file path, a `RegExp` tested against it, or a function `(id) => boolean`. Their JSX is not compiled by MotifJS; they go through Vite's own transform. |
| `storeNames` | on while developing | Name module-level stores for DevTools with their variable and file (relative to the Vite root). Unset, it follows Vite: on in `vite dev`, off in a production build; `true` or `false` sets it. |
| `production` | follows the build | Remove [development-only code](#development-only-code). Unset, it follows Vite: on in a production build, off in `vite dev`. Outside Vite it is on when `NODE_ENV` is `production`. `true` or `false` sets it. |

## Command-line tools

```bash
npx motif-lint [--project tsconfig.json] [--json] [--no-fail] [file.tsx …]
```

Type-aware lint: `MJX005` reports a ternary passed to a component prop whose declared type does not accept a getter; `MJX015` reports a class component override that does not reach `super` on every path, with the base class resolved by the type checker. Exits with code 1 when there are findings (`--no-fail` to disable).

```bash
npx motif-explain src/App.tsx [more.tsx …] [--json] [--site child|element|attr|prop|event|component-event|directive|key] [--code]
```

Shows the call each JSX expression compiles to, whether it is reactive, and what it depends on. `--code` also prints the full generated code.

Both tools are also available as functions: `lintProject`, `lintProgram`, `explain`, `printDiagnostics`, `printExplanations`, `formatExplanations`.

## Exports

The default export is the plugin function. Named exports: `Compiler` (`new Compiler().start(code, filename)` returns the Babel result, with `diagnostics` on the instance), `explain`, `lintProject`, `lintProgram`, `printDiagnostics`, `printExplanations`, `formatExplanations`, and the types `MotifVitePluginOptions`, `MotifDiagnostic`, `MotifExplanation`, `ExplainSite`, `ExplainReactivity` and `LintOptions`.

## Runtime contract

Compiled code calls into the `@motifx/core` runtime:

- the `motifComponent`, `motifFragment`, `FNComponent`, `motifCompiled`, `asyncTracking` and `Component` exports;
- component members: `bindings.*` (each binding directive `x-wait`, `x-display`, `x-model`, `x-text`, `x-html`, `x-value` and `x-watch` calls the method of the same name), `class.add`, `attr.add`, `style`, `motif.on`, `controls.add`, `setText`, and `navigate` on the frame passed to conditional branches;
- property keys: `runover`, `initializeComponent`, `preconfig`, `ref`, `childs`, `__childExpr`, `__isSvgElement`, `onRefCreated`, `x-chunk` (the chunk directive, passed as a number, or `true` when written without a value), the lifecycle hook props that lifecycle directives become (`x-mounted` becomes `onmounted`), and the static class fields `elementTag` and `elementNamespace`.

This set is the compiler contract. It changes only in a major version, so `@motifx/compiler` 1.x works with any `@motifx/core` 1.x. Every compiled module calls `motifCompiled(<contract>)` once; in development the runtime warns with `MJX121` when the numbers differ, for example when a package that ships compiled JSX was built for another major version. The call is marked pure, so production builds drop it.

## License

[MIT](./LICENSE)
