# @motifx/core documentation

Installation, project setup and a first application are covered in the [package README](../README.md). The complete public API, with signatures and types, ships in the bundled declarations (`dist/index.d.ts`).

## Components

A component can be written as a class, a function or an options object. All three styles run on the same core and can be mixed freely.

A class extends `Component` and returns its content from `view()`:

```tsx
import { Component, reactive } from '@motifx/core';

export class Counter extends Component {
    state = reactive({ count: 0 });

    view() {
        return <button onclick={() => this.state.count++}>Clicked {this.state.count} times</button>;
    }
}
```

A function receives its props and returns JSX:

```tsx
import { reactive } from '@motifx/core';

export function Greeting(props: { name: string }) {
    const state = reactive({ likes: 0 });

    return (
        <div>
            <h2>Hello {props.name}</h2>
            <button onclick={() => state.likes++}>Like ({state.likes})</button>
        </div>
    );
}
```

An options object names its element, its data and its view:

```tsx
import { reactive } from '@motifx/core';

export const MessageBox = () => ({
    el: 'div',
    data: reactive({ message: 'Hello' }),
    view() {
        return <p onclick={() => { this.data.message = 'Clicked'; }}>{this.data.message}</p>;
    },
});
```

## Where things are

| Area | Exports |
| --- | --- |
| Components | `Component`, `FNComponent`, `Frame`, `Lazy` |
| Reactivity | `reactive`, `Signal`, `createSignal`, `Computed`, `createComputed`, `effect`, `untracked` |
| Application | `Application` (`Application.CreateBuilder()`) |
| Routing | `app.useRouter()`, `app.router`, `RouterView`, `RouterLink`, `useNavigation()` |
| Dependency injection | `builder.services.addSingleton()` / `addScoped()` / `addTransient()`, `Injectable`, `inject()` |
| Large lists | `Virtualization` |
| Queries | `Query` |
| Errors | `MotifError`; every message carries an `MJX` code |

Reactive dependency inspection lives in a separate entry point, `@motifx/core/devtools` (`debugGetDeps`, `debugGetDepMap`).

## JSX

JSX is compiled at build time by [`@motifx/compiler`](../../compiler/README.md). Use the same major version of both packages.
