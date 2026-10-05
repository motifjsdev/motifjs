import type { ComponentBase, ElementType, EventArgs, IBaseProp } from "./";

type motifPrimitive = string | number | boolean | Node | Text | Element | null | undefined;

declare const DEV: boolean;

export type MotifStyle = string | (() => any) | Array<any> | Object | Partial<CSSStyleDeclaration> | CSSStyleDeclaration;
export type MotifClass = string | Record<string, any> | Array<any> | (() => any);
export type MotifValue = string | number | boolean | Record<string, any> | Array<any> | (() => any);
export type MotifBindable<T> = T | string | (() => T | string);

export interface MotifBaseProps {
    children?: any;
    key?: string | number;
    ref?: ComponentBase | ((component: any) => void);
    style?: MotifStyle;
    class?: MotifClass;
    className?: MotifClass;
}

type MethodLikeProps = {
    focus?: any;
    blur?: any;
    click?: any;
    select?: any;
    scrollIntoView?: any;
    scrollTo?: any;
    scrollBy?: any;
    requestFullscreen?: any;
    exitFullscreen?: any;
    play?: any;
    pause?: any;
    submit?: any;
    reset?: any;
    requestSubmit?: any;
    checkValidity?: any;
    reportValidity?: any;
    show?: any;
    showModal?: any;
    close?: any;
    showPicker?: any;
    setSelectionRange?: any;
    setRangeText?: any;
    requestPointerLock?: any;
    exitPointerLock?: any;
    setPointerCapture?: any;
    releasePointerCapture?: any;
    requestPictureInPicture?: any;
    exitPictureInPicture?: any;
    load?: any;
    fastSeek?: any;
    showPopover?: any;
    hidePopover?: any;
    togglePopover?: any;
    "onconfig"?: (sender: ComponentBase, e: EventArgs) => void;
    "onbuilding"?: (sender: ComponentBase, e: EventArgs) => void;
    "onbuilt"?: (sender: ComponentBase, e: EventArgs) => void;
    /** Element canlı DOM'a (document) bağlandığında bir kez; focus/ölçüm gibi işler için. */
    "onmounted"?: (sender: ComponentBase, e: EventArgs) => void;
    "onconfigured"?: (sender: ComponentBase, e: EventArgs) => void;
    "oninitializing"?: (sender: ComponentBase, e: EventArgs) => void;
    "oninitialized"?: (sender: ComponentBase, e: EventArgs) => void;
};
type MethodLikeKeys = keyof MethodLikeProps;

export type MotifFunctionalComponent<P = Record<string, unknown>> = (
    props: P & MotifBaseProps & any
) => unknown;

export type MotifFunctionalComponentBasic = (
    props: MotifBaseProps
) => unknown;

export type AnyFunctionalComponent<P = any> = (props: P) => unknown;
export type MotifComponentConstructor<TElement extends ElementType = any, P extends Record<string, unknown> = Record<string, unknown>> =
    new (...args: any[]) => ComponentBase<TElement, P>;

export type MotifComponentType<P = Record<string, unknown>, TElement = unknown> =
    | string
    | MotifFunctionalComponent<P>
    | MotifFunctionalComponentBasic
    | AnyFunctionalComponent<P>
    | MotifComponentConstructor<TElement extends ElementType ? TElement : any, P extends Record<string, unknown> ? P : any>
    | { el: string; ctor?: (this: any, props?: any) => any;[newProp: string]: any };

type ExtractEventArg<T> = T extends ((this: any, ev: infer EV) => any) | null ? EV : never;
export type MotifDomEventHandler<EV> = (senderOrEvent: EV & ComponentBase, ev: EV) => unknown;
type motifEventsFor<TElement> = {
    [P in keyof TElement as P extends `on${string}` ? P : never]?:
    TElement[P] extends ((this: any, ev: infer EV) => any) | null
    ? MotifDomEventHandler<EV>
    : MotifDomEventHandler<Event>;
};
export type MotifDomEventProps = motifEventsFor<HTMLElement>;
type MotifManagedProps<P> = 0 extends (1 & P) ? IBaseProp<{}> : Exclude<P, string | Node | undefined>;

// Transform DOM attributes so that non-event, non-method, non-style/class/value props accept either the value or a function returning it
type MotifElementProps<TElement> = {
    [P in keyof Omit<
        Partial<TElement>,
        keyof motifEventsFor<TElement> | 'style' | 'class' | 'className' | 'value' | 'for' | MethodLikeKeys
    >]?: MotifBindable<Partial<TElement>[P]>;
};

type IntrinsicHTML = {
    [K in keyof HTMLElementTagNameMap]:
    MotifElementProps<HTMLElementTagNameMap[K]> &
    motifEventsFor<HTMLElementTagNameMap[K]> &
    Partial<MotifBaseProps> &
    MethodLikeProps &
    (K extends 'input' | 'textarea' ? { value?: MotifValue } : {}) & object & { [key: string]: any };
};

type IntrinsicSVG = IntrinsicHTML;
// type IntrinsicSVG = {
//         keyof motifEventsFor<SVGElementTagNameMap["svg"]> | 'style' | 'class' | 'className' | 'value' | MethodLikeKeys

type IntrinsicElementsMap = IntrinsicHTML & IntrinsicSVG;

export type __attr = {
    key?: string | number;
    ref?: ComponentBase | ((component: any) => void);
    initializeComponent?: (sender: ComponentBase) => void;
    "x-wait"?: (sender: ComponentBase, e: EventArgs) => boolean;
    "x-building"?: (sender: ComponentBase, e: EventArgs) => void;
    "x-built"?: (sender: ComponentBase, e: EventArgs) => void;
    "x-config"?: (sender: ComponentBase, e: EventArgs) => void;
    "x-configured"?: (sender: ComponentBase, e: EventArgs) => void;
    "x-initializing"?: (sender: ComponentBase, e: EventArgs) => void;
    "x-initialized"?: (sender: ComponentBase, e: EventArgs) => void;
    "onbuilding"?: (sender: ComponentBase, e: EventArgs) => void;
    "onbuilt"?: (sender: ComponentBase, e: EventArgs) => void;
    /** Element canlı DOM'a (document) bağlandığında bir kez;*/
    "onmounted"?: (sender: ComponentBase, e: EventArgs) => void;
    "onconfig"?: (sender: ComponentBase, e: EventArgs) => void;
    "onconfigured"?: (sender: ComponentBase, e: EventArgs) => void;
    "oninitializing"?: (sender: ComponentBase, e: EventArgs) => void;
    "oninitialized"?: (sender: ComponentBase, e: EventArgs) => void;
    "x-style"?: MotifStyle;
}
export namespace JSX {
    export type Element = ComponentBase<any, any>;
    export type ElementType = MotifComponentType<any, any>;
    export interface ElementClass extends ComponentBase { }
    export interface ElementAttributesProperty extends __attr {
        props: {};
    };

    export interface IntrinsicElements extends IntrinsicElementsMap {
        [elementName: string]: IntrinsicElementsMap[keyof IntrinsicElementsMap];
    }

    export type LibraryManagedAttributes<C, P> = MotifManagedProps<P>;

    export interface IntrinsicAttributes extends __attr { };
}

declare global {
    namespace JSX {
        export type Element = ComponentBase<any, any>;
        export type ElementType = MotifComponentType<any, any>;
        export interface ElementClass extends ComponentBase { }
        export interface ElementAttributesProperty extends __attr {
            props: {};
        }

        export interface IntrinsicElements extends IntrinsicElementsMap {
            [elementName: string]: IntrinsicElementsMap[keyof IntrinsicElementsMap];
        }

        export type LibraryManagedAttributes<C, P> = MotifManagedProps<P>;

        export interface IntrinsicAttributes extends __attr { }
    }
}
