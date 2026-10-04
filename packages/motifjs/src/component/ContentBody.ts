
import { Component, ComponentBase, EventArgs } from "../";
import { reportWarning } from "../common/diagnostics";


// const ContentBodyCollection = new Map<string, ContentBody>();
const ContentBodyCollectionHandable = new Map<string, ContentBody>();
const changeBodyCollectionHandler = Symbol('changeBodyCollectionHandler')


interface ContentBlockProps {
    target: string
}
export class ContentBlock extends Component<any, ContentBlockProps> {
    constructor(props: ContentBlockProps) {
        super(props);


        // var cb = ContentBodyCollectionHandable.get(props.target);
        // if (cb) {
        // } else {
        //         var cb = ContentBodyCollectionHandable.get(props.target);
        //         if (cb) {
        const forward = (control: ComponentBase) => {
            this.motif.trigger('controladded', { control });
            var cb = ContentBodyCollectionHandable.get(this.props.target);
            if (cb) {
                control.motif.options["ownerContentBlock"] = this;
                cb.controls.add(control);
            }
        };
        this.controls.onAdd = forward;
        this.controls.onAddBeforeBuild = forward;
        if (this.childs) {
            this.controls.add(...this.childs);
        }

    }
    public onConfigured(sender: ComponentBase, e: EventArgs): void {

        var cb = ContentBodyCollectionHandable.get(this.props.target);
        if (cb) {
            this.controls.items.forEach(x => { x.motif.options["ownerContentBlock"] = this; });
            cb.controls.add(...this.controls.items);
        } else {
            this.context.on(changeBodyCollectionHandler, () => {
                var cb = ContentBodyCollectionHandable.get(this.props.target);
                if (cb) {
                    this.controls.items.forEach(x => { x.motif.options["ownerContentBlock"] = this; });
                    cb.controls.add(...this.controls.items);
                }
            });
        }
    }

    public onDisposing(sender: ComponentBase, e: EventArgs): void {
        var cb = ContentBodyCollectionHandable.get(this.props.target);
        if (cb) {
            for (const element of [...cb.controls.items]) {
                if (element.motif.options["ownerContentBlock"] !== this) continue;
                cb.controls.remove(element);
                reportWarning('MJX109', [], element);
            }
        }

    }
    ondisposing(sender: Component<any, ContentBlockProps>) {
        // var cb = ContentBodyCollectionHandable.get(this.props.target);
        // if (cb) {
    }

}
interface ContentBodyProps {
    name: string,
    onconfig?: any
}
export class ContentBody extends Component<any, ContentBodyProps> {
    constructor(props: ContentBodyProps) {
        super(props);
        ContentBodyCollectionHandable.set(this.props.name, this);
        this.context.fire(changeBodyCollectionHandler);
    }
    ondisposing(sender: Component<any, ContentBodyProps>) {
        if (ContentBodyCollectionHandable.get(this.props.name) === this) {
            ContentBodyCollectionHandable.delete(this.props.name);
        }
    }
}