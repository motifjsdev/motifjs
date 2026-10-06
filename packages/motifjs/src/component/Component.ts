import { dom } from "../";
import { ComponentBase, IBaseProp, ParseProps, applyComponentOptions, applyFallthroughProps, applyTransitionProp, extractRefs, safeCallSilent, takePendingRefs, untracked } from "../";
import { disposeUnplacedChilds } from "./componentBase";
import { resolveComponent } from "./resolveComponent";
import { ElementType, EventArgs } from "./types";
import { callReported, motifError } from "../common/diagnostics";

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function readElementTag(ctor: any): string | undefined {
    try {
        const tag = ctor?.elementTag;
        if (typeof tag === 'string') {
            const trimmed = tag.trim();
            if (trimmed) return trimmed;
        }
    } catch { /* ignore */ }
    return undefined;
}

function createDeclaredElement(tag: string, ctor: any, props: any): any {
    const declaredNs = typeof ctor?.elementNamespace === 'string' && ctor.elementNamespace
        ? ctor.elementNamespace as string
        : undefined;
    const isSvg = declaredNs === SVG_NAMESPACE || props?.options?.isSvg === true || props?.__isSvgElement === true;
    if (isSvg) {
        if (props && typeof props === 'object') { (props as any).isSvg = true; }
        return dom.createElementNS(declaredNs || SVG_NAMESPACE, tag, props);
    }
    return dom.createElement(tag, props);
}

export class Component<TElement extends ElementType = any, TProps extends object = any> extends ComponentBase<TElement, TProps> {

    public static elementTag?: string;
    public static elementNamespace?: string;
    public static _placesChilds?: boolean;

    constructor(elementOrParams: TElement | string | IBaseProp<TProps>);
    constructor(element: TElement | string, options: IBaseProp<TProps>);
    constructor(elementOrParams: TElement | string | IBaseProp<TProps>, options?: IBaseProp<TProps>);
    constructor(elementOrParams?: TElement | string | IBaseProp<TProps>, options?: IBaseProp<TProps>);
    constructor() {
        const derivedCtor: any = new.target;
        var args = arguments;
        var elementOrParams;
        var options;
        if (args.length === 1) {
            elementOrParams = args[0];
        } else if (args.length === 2) {
            elementOrParams = args[0];
            options = args[1];
        }

        if (elementOrParams instanceof Function) {
            elementOrParams = resolveComponent(elementOrParams, options);
            if (isOptionsObject(elementOrParams)) {
                return materializeOptionsObject(elementOrParams, options);
            }
        }
        if (Array.isArray(elementOrParams)) {
            const letter = CreateFragment();
            super(letter, {} as TProps);
            var ops = Object.create(options || {});
            for (const key in elementOrParams) {
                const element = elementOrParams[key];
                this.controls.add(new Component(element, ops as any));
            }
        } else
            if (typeof elementOrParams === 'string' && elementOrParams.trim().length > 0) {
                // İlk parametre element ise
                if (!options) { options = {} as any; }

                if (options?.options && options.options.isSvg || options?.__isSvgElement) {
                    const el = dom.createElementNS('http://www.w3.org/2000/svg', elementOrParams, options);
                    (options as any)['isSvg'] = true;
                    super(el as TElement, options as TProps);
                } else {
                    const el = dom.createElement(elementOrParams, options);

                    super(el as TElement, options as TProps);
                }
                // DOM prop'ları (spread/attr) ComponentBase ctor'ında uygulanır: düz Component'ta tümü,
                // alt sınıflarda yalnızca ortak öznitelikler (applyFallthroughProps).
            } else if (elementOrParams instanceof Node) {
                super(elementOrParams as any, options as TProps);
            } else if (elementOrParams instanceof ComponentBase) {
                // Hazır instance geldi; olduğu gibi kullan
                return elementOrParams as any;
            }
            else {
                // Constructor'a element verilmedi (undefined/null/boş) ya da element olarak
                // tanınmayan bir değer geldi. bu iki olasılığa neden olur :
                //   a) Sınıf bir element türü bildirmiş  → o türde gerçek element üretilir
                //   b) Bildirmemiş                        → FRAGMENT: kök yorum düğümü (yer tutucu),
                //      çocuklar açılış/kapanış işaretçileri arasına render edilir
                //  Her bileşenin bir elementi olmak zorunda olduğundan, fragment kök olarak yorum düğümü kullanılır.
                // props hangi argümanda olduğu çağrı biçimine göre değişir:
                //   new Component({ ...props })              → props İLK argüman
                //   super(void 0, props) / super(null, props) → props İKİNCİ argüman
                const fragmentProps = (elementOrParams && typeof elementOrParams === 'object')
                    ? elementOrParams
                    : options;

                // Sınıf bir element türü bildirdiyse (statik elementTag — derleyici
                // Component<HTMLDivElement> generic'inden üretir fragment yerine
                // O TÜRDE gerçek element oluşturulur.
                const declaredTag = readElementTag(derivedCtor);
                if (declaredTag) {
                    const declaredEl = createDeclaredElement(declaredTag, derivedCtor, fragmentProps);
                    super(declaredEl as TElement, (fragmentProps ?? {}) as TProps);
                } else {
                    super(CreateFragment(), (fragmentProps ?? {}) as TProps);
                }

                // Her iki durumda da JSX çocukları (props.childs) içeriğe eklenir.
                // Alt sınıflar initializeComponent'i ezdiği için FragmentNode.initializeComponent'e güvenilemez.
                const kids = this.childs;
                if (Array.isArray(kids) && kids.length) {
                    if (derivedCtor?._placesChilds !== true) {
                        for (const kid of kids) {
                            if (kid) this.controls.add(kid);
                        }
                    }
                }
            }
    }


}


type viewFn<P extends object> = (props: P) => any;

export function FNComponent<P extends object>(view: viewFn<P>) {

    return (props: P) => {
        //debugger; 
        var comp = motifFragment({
            ...props as any,
        });
        comp.controls.add(view(props) as any);
        return comp;
    };
}

function applyJsxFrameworkProps(target: any, props: any, refs: any[]): any {
    if (!props || typeof props !== 'object') return target;
    if (!(target instanceof ComponentBase)) return target;

    applyRefs(target, refs.concat(extractRefs(props)));
    disposeUnplacedChilds(target, (props as any).childs);

    // Fonksiyon bileşeni etiketindeki ortak öznitelikler (class/id/aria-*…) döndürülen köke düşer.
    // Kök `<div {...props}/>` ise aynı değerler zaten uygulanmıştır; ikinci kez uygulanmaz.
    applyFallthroughProps(props, target as ComponentBase);
    applyComponentOptions((props as any).options, target as ComponentBase);
    if (Object.prototype.hasOwnProperty.call(props, 'transition')) {
        applyTransitionProp((props as any).transition, target as ComponentBase);
    }

    const runover = (props as any).runover;
    if (!runover || typeof runover !== 'object') return target;

    const handlers: any[] = (target as any)._base?._onConfigHandlers;
    const configuredBefore = Array.isArray(handlers) ? handlers.length : 0;
    const initializingBefore = handlerCount(target, '_onInitializingHandlers');
    const initializedBefore = handlerCount(target, '_onInitializedHandlers');
    ParseProps(runover, target as ComponentBase);

    callAddedHandlers(target, '_onInitializingHandlers', initializingBefore, 'onInitializing');
    callAddedHandlers(target, '_onInitializedHandlers', initializedBefore, 'onInitialized');

    // Fonksiyon bileşeninin kökü düz bir `Component` olduğunda config aşaması yapıcıda
    // ÇOKTAN çalışmıştır (`isConfigured`); sonradan kaydedilen preconfig/onConfig bir daha
    // çağrılmayacağı için burada elle koşulur. Yalnızca yeni eklenenler çalıştırılır.
    if ((target as any).isConfigured) {
        const pre = (target as any).motif.options?._preconfig;
        if (typeof pre === 'function') {
            safeCallSilent(() => pre(target), 'motifComponent.preconfig');
        }
        const after: any[] = (target as any)._base?._onConfigHandlers;
        if (Array.isArray(after)) {
            for (let i = configuredBefore; i < after.length; i++) {
                const fn = after[i];
                callReported(() => fn(target, { cancel: false } as EventArgs), 'MJX122', 'onConfig');
            }
        }
    }
    return target;
}

function applyRefs(target: any, refs: any[]): any {
    if (target instanceof ComponentBase) {
        for (const fn of takePendingRefs(target, refs)) {
            callReported(() => fn(target), 'MJX122', 'ref');
        }
    }
    return target;
}

function handlerCount(target: any, listName: string): number {
    const list: any[] = target._base?.[listName];
    return Array.isArray(list) ? list.length : 0;
}

function callAddedHandlers(target: any, listName: string, from: number, hook: string): void {
    const list: any[] = target._base?.[listName];
    if (!Array.isArray(list)) return;
    for (let i = from; i < list.length; i++) {
        if (target.isDisposed) return;
        const fn = list[i];
        callReported(() => fn(target, { cancel: false } as EventArgs), 'MJX122', hook);
    }
}

function resolveChildExpression(probe: any): any {
    if (typeof probe !== 'function') return undefined;
    let value: any;
    try { value = untracked(probe); } catch { return undefined; }
    if (value instanceof ComponentBase) return value;
    if (Array.isArray(value) && value.length > 0 && value.every(x => x instanceof ComponentBase)) return value;
    return undefined;
}

export function motifComponent(element: unknown, props?: any) {

    // Etiket adı: element yaratımı (HTML/SVG) ve spread prop uygulaması Component ctor'ının string parametresinde
    if (typeof element === "string") {
        if (element === "text" && props && props.__childExpr) {
            const resolved = resolveChildExpression(props.__childExpr);
            if (resolved !== undefined) return resolved;
        }
        return new Component(element, props);
    }

    if (element instanceof ComponentBase || element instanceof Component) {
        return element;
    }

    // Class component → new, function component/factory → çağır (try/catch tespiti yok)
    if (typeof element === "function") {
        const refs = element.prototype instanceof ComponentBase ? [] : extractRefs(props);
        const el = resolveComponent(element, props);
        if (typeof el == "object" && el !== null && 'el' in el) {
            return applyRefs(materializeOptionsObject(el, props), refs);
        }
        // Sınıf bileşeninde props yapıcıda işlendi; fonksiyon bileşeninde ise dış etiketin
        // çerçeve prop'ları (direktifler, initializeComponent, yaşam döngüsü) hiçbir yere uygulanmamıştı.
        return applyJsxFrameworkProps(el, props, refs);
    }

    if (typeof element == "object" && element !== null && 'el' in element) {
        return materializeOptionsObject(element, props);
    }
    return new Component(element, props);
}

function isOptionsObject(value: unknown): boolean {
    return typeof value == "object" && value !== null && !(value instanceof ComponentBase) && 'el' in value;
}

export function unwrapModule(result: any): any {
    if (result && typeof result === "object" && !(result instanceof ComponentBase) && result.default != null) {
        return result.default;
    }
    return result;
}

function describeLoaded(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === "object" && (Object.prototype.toString.call(value) === '[object Module]' || value.__esModule)) return 'module';
    return typeof value;
}

export function assertLoadedComponent(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    if (value instanceof ComponentBase || Array.isArray(value) || value instanceof Node) return;
    if (typeof (value as any).then === "function") return;
    throw motifError('MJX127', describeLoaded(value));
}

export function resolveToComponent(input: unknown, props?: any): any {
    const resolved = resolveComponent(input, props);
    if (isOptionsObject(resolved)) {
        return materializeOptionsObject(resolved, undefined);
    }
    return resolved;
}

function materializeOptionsObject(spec: any, props: any): any {
    const result: any = motifComponent(spec.el, props);
    Object.getOwnPropertyNames(spec).forEach(key => {
        if (key !== 'el' && key !== 'ctor') {
            result[key] = spec[key];
        }
    });
    if (typeof spec.ctor === 'function') {
        callReported(() => spec.ctor.call(result, props), 'MJX122', 'ctor');
    }
    return result;
}
export function motifFragment(props?: any) {
    return new FragmentNode(props);
}

function CreateFragment() {
    const fragment = dom.createComment("");
    return fragment;
}

export class FragmentNode<TProps extends object = any> extends Component<Comment, TProps> {

    constructor(options?: IBaseProp<TProps>);
    constructor(element: any, props: any);
    constructor(arg1?: any, arg2?: any) {
        if (arguments.length <= 1) {
            super(CreateFragment() as any, arg1 as any);
        } else {
            super(CreateFragment() as any, arg2 as any);
        }
    }

    public override initializeComponent(sender: ComponentBase): void {
        const s = (this as any).childs as ComponentBase[] | undefined;
        if (Array.isArray(s) && s.length) {
            for (const child of s) {
                if (child) this.controls.add(child);
            }
        }
        safeCallSilent(() => {
            const nodes = (this.motif.options as any)?.props?.nodes as any[] | undefined;
            if (Array.isArray(nodes) && nodes.length) {
                for (const n of nodes) {
                    if (n) this.controls.add(n);
                }
            }
        }, 'Fragment.initializeComponent.props.nodes');
    }
}


export class motifDocument {
    public router: any = {};
    public context: any = {};
    public run(appElement: Node, app: Component): Component {
        const MainApp = new Component(appElement, {});
        app.parent = MainApp;
        MainApp.controls.add(app);
        //const renderer = new motifRenderer();
        //renderer.render(MainApp);
        MainApp.build();
        return MainApp;
        //console.warn("MainApp:", MainApp);
    }
}
