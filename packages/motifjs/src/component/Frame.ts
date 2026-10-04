import { dom } from "../core";
import { Component } from "../";
import { ComponentBase, IDisposeOptions } from "../";
import { Lazy, LazyOptions } from "../";
import { disposeNavigationTarget, navigateHost } from "./navigation";


export class Frame extends Component {
    public current: ComponentBase | ComponentBase[] | null = null;
    public _latestNavigateId = 0;
    public _navLock: Promise<void> = Promise.resolve();
    public _navAbort?: AbortController;
    isBusy: boolean = false;
    constructor(props?: any) {
        super(dom.createComment(''), props);
        if (props && props.childs && Array.isArray(props.childs) && props.childs.length > 0) {
            this.controls.add(props.childs);
        }
    }
    public async dispose(options: IDisposeOptions = { deep: true }) {
        await disposeNavigationTarget(this.current, options);
        await super.dispose(options);
    }
    public async flush() {
        await disposeNavigationTarget(this.current);
    }
    protected override async _clear() {
        await disposeNavigationTarget(this.current);
    }
    previouspage: any;
    public async navigate(page: ComponentBase | ComponentBase[], keepOldControl: boolean = false) {
        await navigateHost(this, page, keepOldControl);
    }

    public async navigateLazy<T>(caller: () => Promise<T>, options?: LazyOptions<T>, keepOldControl: boolean = false) {
        const lazyFrame = Lazy({ caller, options });
        await this.navigate(lazyFrame, keepOldControl);
    }
}
