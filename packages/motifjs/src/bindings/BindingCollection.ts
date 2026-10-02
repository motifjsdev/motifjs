

import { Component, ComponentBase, Frame, motifFragment, toDisposable } from "../";
import { dom } from "../";
import { effect, untracked } from "../";
import { Binding, BindingFormatInfo, IBaseBinding, IBindingCollection, ListBinding, ListBindingOptions, readModelValue } from "./";
import { reportError } from "../common/diagnostics";
import { lazyBindMethods } from "../common/lazyBind";


export class BindingCollection implements IBindingCollection {
    private _items: IBaseBinding[] = [];
    private _component: ComponentBase;
    private _branchScope: Array<() => void> | null = null;

    constructor(component: ComponentBase) {
        this._component = component;
    }
    private _own(stop: () => void) {
        if (this._branchScope) {
            this._branchScope.push(stop);
            return;
        }
        this._component.motif.register(toDisposable(() => {
            try { stop(); } catch { }
        }));
    }

    when(computeFn: () => any, renderFn: (isTrue: boolean) => any) {

        var frame = new Frame();
        this._component.controls.add(frame);
        let shown = false;
        let last: any;
        const stop = effect(computeFn, (value) => {
            if (shown && (Object.is(last, value) || (!last && !value))) return;
            shown = true;
            last = value;
            untracked(() => {
                if (value) {
                    frame.navigate(renderFn(value as any))
                } else {
                    frame.navigate(motifFragment())
                }
            });
        });
        this._own(stop);

        return null as any;

    }

    get items(): IBaseBinding[] {
        return [...this._items];
    }

    text(cb: any) {
        this.add("textContent", cb);
    };


    value(fn: () => any) {
        this.add("value", fn);
    };

    add(propertyName: string, dataSource: any): IBaseBinding;
    add(propertyName: string, dataSource: any, dataMember: string): IBaseBinding;
    add(propertyName: string, dataSource: any, dataMember: string, formatString: string): IBaseBinding;
    add(propertyName: string, dataSource: any, dataMember: string, formatString: string, formatInfo: BindingFormatInfo): IBaseBinding;
    add(binding: IBaseBinding): IBaseBinding;
    add(...args: any[]): IBaseBinding {
        let binding: IBaseBinding;
        if (args.length === 1 && typeof args[0] === 'object' && 'propertyName' in args[0]) {

            binding = args[0];
        } else {

            const [propertyName, dataSource, dataMember, formatString, formatInfo] = args;
            binding = new Binding(this._component, propertyName, dataSource, dataMember, formatString, formatInfo);
        }

        this._items.push(binding);

        if (this._component.isBuilt) {
            (binding as Binding).activate();
        }
        return binding;
    }

    wait(predicate: () => any): IBaseBinding {
        const binding = new Binding(this._component, 'isWait', predicate);
        this._items.push(binding);
        if (this._component.isBuilt) {
            (binding as Binding).activate();
        }
        return binding;
    }

    display(predicate: () => any): IBaseBinding {
        const binding = new Binding(this._component, 'isWait', () => !predicate());
        this._items.push(binding);
        if (this._component.isBuilt) {
            (binding as Binding).activate();
        }
        return binding;
    }

    html(predicate: () => any): IBaseBinding {
        const binding = new Binding(this._component, 'innerHTML', predicate);
        this._items.push(binding);
        if (this._component.isBuilt) {
            binding.activate();
        }
        return binding;
    }
    list(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase): IBaseBinding;
    list(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase, options: ListBindingOptions): IBaseBinding;
    list(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase, options?: ListBindingOptions): IBaseBinding {
        const binding = new ListBinding(this._component, itemsFn, renderFn, options);
        this._items.push(binding);
        if (this._component.isBuilt) {
            binding.activate();
        }
        return binding;
    }

    loop(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase): IBaseBinding;
    loop(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase, options: ListBindingOptions): IBaseBinding;
    loop(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase, options?: ListBindingOptions): IBaseBinding {
        const binding = new ListBinding(this._component, itemsFn, renderFn, options);
        this._items.push(binding);
        if (this._component.isBuilt) {
            binding.activate();
        }
        return binding;
    }
    method(cb: () => any) {
        const host = this._component;
        let text: ComponentBase | null = null;
        let frame: Frame | null = null;
        const place = (next: ComponentBase, previous: ComponentBase | null) => {
            if (!previous) {
                host.controls.add(next);
                return;
            }
            host.controls.insert(host.controls.items.indexOf(previous), next);
            host.controls.remove(previous);
        };
        const stop = effect(cb, (result) => {
            if (host.isDisposed) return;
            const isText = typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' || typeof result === 'bigint';
            if (isText || (text && result == null)) {
                if (text) {
                    text.setText(result as any);
                    return;
                }
                text = new Component(dom.createTextNode(result as any));
                place(text, frame);
                frame = null;
                return;
            }
            if (!frame) {
                frame = new Frame();
                place(frame, text);
                text = null;
            }
            frame.navigate(result == null ? motifFragment() : result as any);
        });
        host.motif.register(toDisposable(() => {
            try { stop(); } catch { }
        }));
    }

    ternary(conditionFn: () => any, trueFn: (frame: Frame) => any, falseFn: (frame: Frame) => any) {
        const frame = new Frame();
        this._component.controls.add(frame);
        this._ternaryCallTop(
            conditionFn,
            () => { trueFn(frame); },
            () => { falseFn(frame); }
        );
        return null as any;
    }

    private _ternarySchedule(condFn: () => any, onTrue: () => void, onFalse: () => void, defer: (run: () => void) => void) {
        let first = true;
        let last: any;
        let stopped = false;
        let inner: Array<() => void> = [];
        const stopInner = () => {
            const list = inner;
            inner = [];
            for (const stop of list) {
                try { stop(); } catch { }
            }
        };
        const stopEffect = effect(condFn, (condition) => {
            if (!first && Object.is(last, condition)) return;
            last = condition;
            const run = () => {
                stopInner();
                const outer = this._branchScope;
                this._branchScope = inner;
                try {
                    if (condition) { onTrue(); } else { onFalse(); }
                } finally {
                    this._branchScope = outer;
                }
            };
            if (first) {
                first = false;
                untracked(run);
                return;
            }
            defer(() => { if (!stopped && !this._component.isDisposed) run(); });
        });
        this._own(() => {
            stopped = true;
            stopEffect();
            stopInner();
        });
    }
    private ternaryCall(condFn: () => any, onTrue: () => void, onFalse: () => void) {
        this._ternarySchedule(condFn, onTrue, onFalse, (run) => queueMicrotask(run));
    }
    private _ternaryCallTop(condFn: () => any, onTrue: () => void, onFalse: () => void) {
        this._ternarySchedule(condFn, onTrue, onFalse, (run) => setTimeout(run, 0));
    }

    watch(cb: () => any) {
        const ef = effect(() => {
            cb();
        });
        this._component.motif.register(toDisposable(() => {
            try { ef(); } catch { }
        }));
    }
    remove(binding: IBaseBinding): void {
        const index = this._items.indexOf(binding);
        if (index > -1) {
            this._items.splice(index, 1);
            binding.deactivate();
        }
    }

    clear(): void {
        this._items.forEach(binding => (binding as Binding).deactivate());
        this._items = [];
    }

    activateAll(): void {
        this._items.forEach(binding => {
            binding.activate();
        });
    }

    model(dataSource: any): IBaseBinding;
    model(dataSource: any, dataMember: string): IBaseBinding;
    model(dataSource: any, dataMember: string, formatString: string): IBaseBinding;
    model(dataSource: any, dataMember: string, formatString: string, formatInfo: BindingFormatInfo): IBaseBinding;
    model(getter: () => any, setter: (value: any) => void): IBaseBinding;
    model(binding: IBaseBinding): IBaseBinding;
    model(...args: any[]): IBaseBinding {

        var tn = '';
        if (this._component.element) {
            tn = (this._component.element as HTMLElement).tagName;
        }
        var propertyName = 'value';
        switch (tn.toLowerCase()) {
            case 'input':

                propertyName = 'model';
                break;
            case 'select':
                propertyName = 'value';
                break;
            case 'textarea':
                propertyName = 'value';
                break;
            case 'img':
                propertyName = 'src';
                break;
            case 'audio':
                propertyName = 'src';
                break;
            case 'video':
                propertyName = 'src';
                break;
            default:

        }
        let binding: IBaseBinding;
        if (args.length === 1 && typeof args[0] === 'object') {
            binding = args[0];
        } else if (typeof args[0] === 'function' && typeof args[1] === 'function') {
            binding = new Binding(this._component, propertyName, args[0]);
            binding.setter = args[1];
        } else {
            const [dataSource, dataMember, formatString, formatInfo] = args;
            binding = new Binding(this._component, propertyName, dataSource, dataMember, formatString, formatInfo);
        }
        const lowerTag = tn.toLowerCase();
        if (lowerTag === 'input' || lowerTag === 'select' || lowerTag === 'textarea') {
            const writeBack = () => {
                try {
                    const el: any = this._component.element;
                    if (!el) return;

                    let value: any = readModelValue(el);
                    const b: any = binding;
                    if (typeof b.converterBack === 'function') {
                        value = b.converterBack(value);
                    }
                    if (typeof b.setter === 'function') {
                        b.setter(value);
                        return;
                    }
                    const member: string | undefined = b.dataMember;
                    const source = b.dataSource;
                    if (member && source != null) {

                        const path = member.split('.');
                        let target: any = source;
                        for (let i = 0; i < path.length - 1 && target != null; i++) {
                            target = target[path[i]];
                        }
                        if (target != null) target[path[path.length - 1]] = value;
                    } else if (source != null && typeof source === 'object' && 'value' in source) {

                        source.value = value;
                    }
                } catch { /* ignore */ }
            };

            this._component.motif.on('input' as any, writeBack as any);
            this._component.motif.on('change' as any, writeBack as any);
        }

        this._items.push(binding);
        if (this._component.isBuilt) {
            (binding as Binding).activate();
        }
        return binding;
    }


    deactivateAll(): void {
        this._items.forEach(binding => binding.deactivate());
        this._items = [];
    }

    reActivateAll(): void {
        for (const binding of [...this._items]) {
            if (typeof binding.reActivate !== 'function') continue;
            try {
                binding.reActivate();
            } catch (error) {
                reportError('MJX208', error);
            }
        }
    }

    switchCase(
        discriminatorFn: () => any,
        cases: Record<string | number, (frame: Frame) => any>,
        defaultFn?: (frame: Frame) => any
    ) {
        const frame = new Frame();
        this._component.controls.add(frame);
        var currentValue: any;
        var defaultRunned = false;
        const ef = effect(discriminatorFn, (value) => {
            if (currentValue == value) return;
            currentValue = value;
            const caseKey = String(value);
            if (Object.prototype.hasOwnProperty.call(cases, caseKey)) {
                cases[caseKey](frame);
                defaultRunned = false;
            } else if (defaultFn) {
                if (defaultRunned) return;
                defaultRunned = true;
                defaultFn(frame);
            } else {
                if (defaultRunned) return;
                defaultRunned = true;
                frame.navigate(motifFragment());
            }
        });
        this._component.motif.register(toDisposable(() => {
            try { ef(); } catch { }
        }));

        return null as any;
    }
}

lazyBindMethods(BindingCollection.prototype, [
    'add', 'remove', 'clear', 'activateAll', 'deactivateAll', 'reActivateAll',
    'when', 'text', 'value', 'list', 'loop', 'method', 'watch', 'display', 'wait',
    'ternaryCall', '_ternaryCallTop'
]);