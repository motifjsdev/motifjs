import { Component } from "..";
import { ComponentBase, IBaseProp } from "../";
import { disposeNavigationTarget, navigateHost } from "../component/navigation";
import { RouterViewRegistry } from "./RouterViewRegistry";

export interface RouterViewProps extends IBaseProp<{ name?: string }> { }
export const RouterViewBuilt = Symbol.for("RouterView.built");;
export class RouterView extends Component {
    constructor(props: IBaseProp<RouterViewProps>) {
        super(props);
    }
    public _navLock: Promise<void> = Promise.resolve();
    public _navAbort?: AbortController;
    public get __isRouterView(): boolean {
        return true;
    }
    public get scopeId(): string {
        let p: any = this.parent, ids: string[] = [];
        while (p) {
            ids.push(p.constructor?.name ?? '');
            p = p.parent;
        }
        return ids.join('>');
    }
    public disposingChilds = false;
    previouspage: any;
    current: ComponentBase | ComponentBase[] | null = null;
    _latestNavigateId = 0;
    isBusy: boolean = false;

    public async navigate(page: ComponentBase | ComponentBase[], keepOldControl: boolean = false) {
        await navigateHost(this, page, keepOldControl);
    }

    public async disposeTarget(target: ComponentBase | ComponentBase[] | null): Promise<void> {
        await disposeNavigationTarget(target);
    }
    public override onBuilt() {
        try {

            RouterViewRegistry.register(this.props.name ?? 'default', this.scopeId, this);
            let p: any = this.parent;
            while (p) {
                p.motif.trigger(RouterViewBuilt, this);
                p = p.parent;
            }
        } catch { /* ignore */ }
    }

    public override onDisposed() {
        try {
            RouterViewRegistry.unregister(this.props.name ?? 'default', this.scopeId);
        } catch { /* ignore */ }
    }

}