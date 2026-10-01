# @motifx/core

A UI framework for JavaScript and TypeScript: components written as classes, functions or options objects, fine-grained reactivity without a virtual DOM, routing and dependency injection in one package.

- **No render loop.** Components are bound directly to real DOM nodes; a state change updates only the node or attribute that depends on it.
- **Compiled JSX.** The [`@motifx/compiler`](https://www.npmjs.com/package/@motifx/compiler) compiler lowers JSX into direct reactive bindings at build time.
- **Batteries included.** Router, dependency injection, lifecycle hooks, transitions, list virtualization and resource disposal ship with the core.

## Install

```bash
npm install @motifx/core
npm install -D @motifx/compiler vite typescript
```

## Setup

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import compiler from '@motifx/compiler';

export default defineConfig({
    plugins: [compiler()],
    esbuild: { jsx: 'preserve' },
});
```

`tsconfig.json`:

```json
{
    "compilerOptions": {
        "target": "ES2021",
        "module": "esnext",
        "moduleResolution": "bundler",
        "strict": true,
        "jsx": "preserve",
        "useDefineForClassFields": true,
        "lib": ["ESNext", "DOM", "DOM.Iterable"]
    }
}
```

`jsx: "preserve"` is required in both places: the JSX is compiled by `@motifx/compiler`, not by esbuild or TypeScript.

## A first component

```tsx
import { Application, Component, reactive } from '@motifx/core';

class Counter extends Component {
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

const app = Application.CreateBuilder().build();
app.run('#app', new Counter());
```

With a router, pass no root component and MotifJS mounts a `RouterView` for you:

```ts
import { Application } from '@motifx/core';
import { routes } from './routes';

const app = Application.CreateBuilder().build();
app.useRouter({ routes, mode: 'history' });
app.run('#app');
```

## Using a CDN

A UMD build is published for use without a build step. It exposes the global `motif`:

```html
<div id="app"></div>
<script src="https://cdn.jsdelivr.net/npm/@motifx/core@1/dist/index.umd.min.js"></script>
<script>
    const { Application, Component, reactive } = motif;
    const state = reactive({ count: 0 });

    class Counter extends Component {
        constructor() { super('button'); }
        onConfig() {
            this.bindings.add('textContent', state, 'count');
            this.motif.on('click', () => state.count++);
        }
    }

    Application.CreateBuilder().build().run('#app', new Counter());
</script>
```

JSX needs the `@motifx/compiler` compiler, so CDN usage relies on the binding API directly.

## Package contents

| File | Format |
| --- | --- |
| `dist/index.esm.js` | ES module (`import`) |
| `dist/index.cjs` | CommonJS (`require`) |
| `dist/index.umd.js`, `dist/index.umd.min.js` | UMD for `<script>` tags, global `motif` |
| `dist/index.esm.min.js` | Single-file ES module for `<script type="module">` |

Every build ships with a source map that points into the included `src/` folder.

## Diagnostics

Reactivity inspection helpers live in a separate entry point so they stay out of the main API:

```ts
import { debugGetDeps } from '@motifx/core/devtools';

const deps = debugGetDeps(state);
```

`debugGetDeps(target)` returns the effects subscribed to each key of a reactive object; `debugGetDepMap()` returns the whole dependency map. They share the runtime instance with `@motifx/core`.

## Documentation

Guides and API reference: [motifjs.com](https://motifjs.com/)

## License

[MIT](./LICENSE)
