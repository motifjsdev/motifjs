import { CSSTransitionInfo, TransitionProps } from "../common/transition";
import { TransitionMode } from "../common/transitionRegistry";

export interface IHtmlElement extends HTMLElement { }
export interface IElement extends Node { }
export type ElementType = IElement | IHtmlElement | DocumentFragment | Comment | Text;
export type CustomParameters<T extends any> = T extends (...args: infer P) => any ? P[0] : never;


export type IsOptional<T> = T extends {} ? { [K in keyof T]-?: {} extends Pick<T, K> ? true : false }[keyof T] : false;

export type OptionalParams<T> = T extends null ? { params?: undefined } : T extends undefined ? { params?: undefined } : IsOptional<T> extends true ? T : T;


export interface EventArgs {
    cancel: boolean;
}

export interface VisibilityChangedEventArgs extends EventArgs {
    visible: boolean;
}

export type RouterClassingSettings = {
    to: 'all' | 'active' | 'exact' | 'none',
    path: string,
    activeClass?: string,
    exactClass?: string,
    onActive?: () => void,
    offActive?: () => void,
    onExact?: () => void,
    offExact?: () => void,
}

export interface ComponentBaseOptions<TProps> {
    [key: string]: any;
    cache?: DocumentFragment;
    closeFragment?: Comment;
    transition: {
        transitionInfo: () => {
            in: CSSTransitionInfo,
            out: CSSTransitionInfo
        },
        name: string,
        mode?: TransitionMode,
        classes?: TransitionProps,
        activeCssCancel: (() => void) | null,
        activeCssPhase: 'enter' | 'leave' | null,
        cssProps: () => TransitionProps | null,
        skipNextLeave: boolean
        _suppressEnter: boolean
        _markedDirection: boolean
        in: (op: { keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions }) => void,
        out: (op: { keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions }) => void,
        enterTransition: (resolve: () => void) => Animation,
        leaveTransition: (resolve: () => void) => Animation,
        _runCss: (phase: 'enter' | 'leave', resolve: () => void, appear?: boolean) => Animation,
        activeAnimations: Animation[],
        run: (keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions, resolve?: () => void) => Animation
    },
    set enableRouterClassing(value: RouterClassingSettings);
    getInstance(): any;
    hasEvent: (name: string) => boolean;
}


export const shimAnimation: any = {
    cancel() { },
    addEventListener() { },
    removeEventListener() { },
    oncancel: null,
    playState: 'finished'
};


export type AnyEvents = {
    [key: string]: any
}

export type HtmlElementEvents = {
    [K in keyof IHtmlElement as K extends `on${string}` ?
    | Uncapitalize<K extends `on${infer EventName}` ? EventName : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:passive` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:passive:prevent` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:passive:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:passive:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:passive:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:passive:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:prevent` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:prevent:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:prevent:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:prevent:trusted:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:prevent:trusted:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:stop:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:stop:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:stop:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:trusted:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:once:trusted:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:prevent` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:prevent:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:prevent:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:prevent:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:prevent:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:stop:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:stop:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:stop:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:trusted:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:trusted:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:capture:self` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:passive:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:prevent` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:prevent:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:prevent:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:prevent:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:prevent:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:stop` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:stop:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:stop:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:stop:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:trusted` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:trusted:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:trusted:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:capture` : never>
    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:capture:self` : never>

    | Uncapitalize<K extends `on${infer EventName}` ? `${EventName}:self` : never>
    : 'x:building' | 'x:built' | 'x:initializing' | 'x:initialized' | 'x:disposing' | 'x:disposed' | 'x:config' | 'x:configured' | 'x:visibilityChanged' | 'x:mounted']
    : CustomParameters<IHtmlElement[K]> extends Event ? CustomParameters<IHtmlElement[K]> : EventArgs;

} & { 'x:visibilityChanged': VisibilityChangedEventArgs } & AnyEvents;