# MotifJS

A UI framework for JavaScript and TypeScript: components written as classes, functions or options objects, fine-grained reactivity without a virtual DOM, routing and dependency injection. JSX is compiled at build time into direct DOM bindings.

> [!IMPORTANT]
> **MotifJS comes from [movijs](https://www.npmjs.com/package/movijs), a framework we wrote for our own systems.**
>
> It started in 2018 as movico. That one never went to npm, we only passed it around locally. In 2022 it became movijs and we put it on npm. We used it in our own projects for years and always meant to release it under MIT, but there was never enough time for docs or for making it a proper public project. The last version, 1.4.1, came out in December 2024 and it hasn't been updated since.
>
> MotifJS is the version we are opening up, and we now work on it full time. The core has been reworked, there is a new JSX compiler and everything lives in one monorepo. If you use `movijs`, switch to the `@motifx` packages below. The API is different, so expect a migration, not a drop-in replacement.

## Packages

This repository is an npm workspaces monorepo:

| Package | Path | Description |
| --- | --- | --- |
| `@motifx/core` | [`packages/motifjs`](packages/motifjs) | Core runtime: components, reactivity, routing, dependency injection |
| `@motifx/compiler` | [`packages/compiler`](packages/compiler) | JSX compiler for Vite and Rollup, plus the `motif-lint` and `motif-explain` tools |
| `motifjs-tests` | [`packages/tests`](packages/tests) | Test suite for the core (private) |

## A quick look

```tsx
import { Component, reactive } from '@motifx/core';

export class Counter extends Component {
    state = reactive({ value: 0 });

    view() {
        return (
            <div>
                <button type="button" onclick={() => this.state.value--}>−</button>
                <output>{this.state.value}</output>
                <button type="button" onclick={() => this.state.value++}>+</button>
            </div>
        );
    }
}
```

Starting an application:

```ts
import { Application } from '@motifx/core';
import { routes } from './routes';

const builder = Application.CreateBuilder();
const app = builder.build();

app.useRouter({ routes, mode: 'history' });
app.run('#app');
```

Enabling the compiler in Vite:

```ts
import { defineConfig } from 'vite';
import compiler from '@motifx/compiler';

export default defineConfig({
    plugins: [compiler()],
    esbuild: { jsx: 'preserve' }, // the compiler compiles JSX; esbuild must leave it alone
});
```

## Development

```bash
npm install
npm run build   # build every package
npm test        # run every test suite
```

The core test suite in `packages/tests` runs against the built `dist` output of both packages, so build before testing.

## License

MIT
