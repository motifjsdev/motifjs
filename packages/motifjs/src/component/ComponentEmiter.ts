import { Emitter, Event as DelegateEvent } from "../delegate";
import { disposableCore, IDisposable } from "../disposable";
import { ComponentBase } from "../";
import { EventArgs } from "./types";
import { callReported } from "../common/diagnostics";

export class ComponentEmiter {

    private _emitters: Map<string, Emitter<EventArgs>> = new Map();
    private _sourceDisposables: Map<string, Set<IDisposable>> = new Map();
    private _listenerDisposables: Map<string, Map<Function, IDisposable[]>> = new Map();

    constructor(private component: ComponentBase) {
        this.fire = this.fire.bind(this);
        this.on = this.on.bind(this);
        this.off = this.off.bind(this);
        this.createEvent = this.createEvent.bind(this);
        this.getOrCreateEmitter = this.getOrCreateEmitter.bind(this);
        this.addSource = this.addSource.bind(this);
        this.clear = this.clear.bind(this);

    }

    public fire(eventName: string, args: EventArgs) {

        try {
            const e = this._emitters?.get(eventName.toLowerCase());
            if (e) {
                e.fire(args);
            }
        } catch { }
    }

    public on(event: any, cb: (sender: ComponentBase | this, ev: any) => any) {

        try {
            this.createEvent(event, cb);
        } catch {
        }
    }
    public off(event: any, cb: (sender: ComponentBase | this, ev: any) => any) {
        const lower = String(event).toLowerCase();
        const map = this._listenerDisposables.get(lower);
        if (!map) return this;
        const list = map.get(cb);
        map.delete(cb);
        list?.forEach(d => { try { d.dispose(); } catch { } });
        return this;
    }
    private getOrCreateEmitter(name: string): Emitter<EventArgs> {
        let e = this._emitters.get(name);
        if (!e) {
            this._emitters.set(name, new Emitter<EventArgs>());
            e = this._emitters.get(name);
        }
        return e!;
    }

    private createEvent(event: any, cb: (sender: ComponentBase | this, ev: any) => any) {
        const full = String(event);
        const lowerFull = full.toLowerCase();
        const hook = lowerFull.startsWith('on') ? 'x:' + lowerFull.slice(2) : lowerFull;
        const invoke = (e: EventArgs) => {
            let res: any;
            callReported(() => {
                res = (cb as any).length <= 1 ? (cb as any)(e as any) : cb(this.component, e as any);
                return res;
            }, 'MJX122', hook);
            return res;
        };

        const emitter = this.getOrCreateEmitter(lowerFull);
        const disp = emitter.event((e) => invoke(e));

        let map = this._listenerDisposables.get(lowerFull);
        if (!map) { map = new Map(); this._listenerDisposables.set(lowerFull, map); }
        const list = map.get(cb);
        if (list) { list.push(disp); } else { map.set(cb, [disp]); }
        return this;
    }

    public addSource(event: string, source: Emitter<EventArgs> | DelegateEvent<EventArgs>) {
        const lower = String(event).toLowerCase();
        const target = this.getOrCreateEmitter(lower);
        const forward = (ev: DelegateEvent<EventArgs>) => ev(e => target.fire(e));
        let disp: IDisposable | undefined;
        try {
            if (source instanceof Emitter) {
                disp = forward(source.event);
            } else {
                disp = forward(source);
            }
        } catch { }
        if (disp) {
            let set = this._sourceDisposables.get(lower);
            if (!set) { set = new Set(); this._sourceDisposables.set(lower, set); }
            set.add(disp);
            this.component.motif.register(disposableCore.toDisposable(() => {
                try { disp?.dispose(); } catch { }
                try { set?.delete(disp!); } catch { }
            }));
        }
        return this;
    }

    public clear(event?: string) {
        if (event) {
            const lower = event.toLowerCase();
            const srcs = this._sourceDisposables.get(lower);
            srcs?.forEach(d => { try { d.dispose(); } catch { } });
            this._sourceDisposables.delete(lower);
            const agg = this._emitters.get(lower);
            try { agg?.dispose(); } catch { }
            this._emitters.delete(lower);
            this._listenerDisposables.delete(lower);
        } else {
            for (const key of Array.from(this._emitters.keys())) { this.clear(key); }
        }
        return this;
    }
}