import { Application, Component, ComponentBase, dom, EventArgs, isExactMatch, startsWithPath } from "../";
import { Router } from "./common";

type RouterLinkOptions = {
    to: string;
    el?: string | Node;
    showHref?: boolean;
    text?: string;
    exactClass?: string;
    activeClass?: string;
    bypass?: boolean;
    target?: string;
    onExact?: () => void;
    offExact?: () => void;
    onActive?: () => void;
    offActive?: () => void;
};

export class RouterLink extends Component<any, RouterLinkOptions> {
    constructor(props: RouterLinkOptions) {

        super(props.el ?? 'a', props);
        if (props.showHref !== false) this.attr.add({ href: props.to });
        if (props.target) this.attr.add({ target: props.target });

        this.motif.on('click', (s, e: MouseEvent) => {
            if (props.bypass) return;
            if (props.target && props.target !== '_self') return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            const router: Router | undefined = Application.main.router;
            if (router) router.navigate(props.to);
        });

        if (this.childs && this.childs.length) {
            this.controls.add(...this.childs);
        } else if (props.text != null) {
            this.attr.add({ textContent: props.text });
        }

    }

    public onBuilt(sender: ComponentBase, e: EventArgs): void {
        this.motif.options.enableRouterClassing = {
            to: 'all',
            path: this.props.to,
            activeClass: this.props.activeClass,
            exactClass: this.props.exactClass,
            onActive: this.props.onActive,
            offActive: this.props.offActive,
            onExact: this.props.onExact,
            offExact: this.props.offExact
        }
    }

}