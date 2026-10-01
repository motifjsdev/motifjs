
import { dom } from "../";

type TransitionKind = 'transition' | 'animation'

export interface CSSTransitionInfo {
    type: TransitionKind | null
    timeout: number
    propCount: number
    hasTransform: boolean
}

export interface TransitionProps {
    name?: string
    type?: TransitionKind
    css?: boolean
    duration?: number | { enter: number; leave: number }
    enterFromClass?: string
    enterActiveClass?: string
    enterToClass?: string
    appearFromClass?: string
    appearActiveClass?: string
    appearToClass?: string
    leaveFromClass?: string
    leaveActiveClass?: string
    leaveToClass?: string
}


interface TimingSample {
    kind: TransitionKind
    longest: number
    tracks: number
}

function cssTimeToMs(text: string): number {
    const amount = text.substring(0, Math.max(0, text.length - 1)).replace(',', '.');
    return 1000 * Number(amount);
}

function sampleTiming(styles: any, kind: TransitionKind): TimingSample {
    const listOf = (aspect: 'delay' | 'duration'): string[] => {
        const declared: string = styles[`${kind}-${aspect}`] || '';
        return declared.split(', ');
    };
    const delays = listOf('delay');
    const durations = listOf('duration');
    let longest = -Infinity;
    for (let track = 0; track < durations.length; track++) {
        const total = cssTimeToMs(durations[track]) + cssTimeToMs(delays[track % delays.length]);
        longest = Math.max(longest, total);
    }
    return { kind, longest, tracks: durations.length };
}

const transformTrack = /(?:^|\W)(?:transform|all)(?:,|$)/;

function computeTransitionInfo(styles: any, Type?: TransitionProps['type']): CSSTransitionInfo {
    if (!styles) {
        return { type: 'animation', timeout: 0, propCount: 0, hasTransform: false };
    }

    const samples: Record<TransitionKind, TimingSample> = {
        transition: sampleTiming(styles, 'transition'),
        animation: sampleTiming(styles, 'animation'),
    };

    let winner: TimingSample | null;
    let timeout: number;
    if (Type === 'transition' || Type === 'animation') {
        const forced = samples[Type];
        winner = forced.longest > 0 ? forced : null;
        timeout = winner ? winner.longest : 0;
    } else {
        const { transition, animation } = samples;
        timeout = Math.max(transition.longest, animation.longest);
        winner = !(timeout > 0) ? null : transition.longest > animation.longest ? transition : animation;
    }

    const type = winner ? winner.kind : null;
    return {
        type,
        timeout,
        propCount: winner ? winner.tracks : 0,
        hasTransform: type === 'transition' && transformTrack.test(styles.transitionProperty),
    };
}

export function getTransitionInfo(el: Element, name: string, Type?: TransitionProps['type']): CSSTransitionInfo {
    if (el.isConnected && el.nodeType !== 8) {
        return computeTransitionInfo(dom.window.getComputedStyle(el), Type);
    }
    const fxElement = dom.createElement('div');
    fxElement.setAttribute('style', 'width:0!important;height:0!important;display:none');
    dom.body.appendChild(fxElement);
    fxElement.setAttribute('class', name);
    try {
        return computeTransitionInfo(dom.window.getComputedStyle(fxElement), Type);
    } finally {
        fxElement.remove();
    }
}


export function getTransitionInfoFromElement(el: Element, Type?: TransitionProps['type']): CSSTransitionInfo {
    return computeTransitionInfo(dom.window.getComputedStyle(el), Type);
}

export type TransitionPhase = 'enter' | 'leave';

export function resolveTransitionClasses(props: TransitionProps, phase: TransitionPhase, appear: boolean = false): { from: string, active: string, to: string } {
    const name = props.name || 'motif';
    if (phase === 'enter') {
        const enter = {
            from: props.enterFromClass ?? `${name}-enter-from`,
            active: props.enterActiveClass ?? `${name}-enter-active`,
            to: props.enterToClass ?? `${name}-enter-to`,
        };
        if (!appear) return enter;
        return {
            from: props.appearFromClass ?? enter.from,
            active: props.appearActiveClass ?? enter.active,
            to: props.appearToClass ?? enter.to,
        };
    }
    return {
        from: props.leaveFromClass ?? `${name}-leave-from`,
        active: props.leaveActiveClass ?? `${name}-leave-active`,
        to: props.leaveToClass ?? `${name}-leave-to`,
    };
}

export function runCssTransition(el: Element, props: TransitionProps, phase: TransitionPhase, done: () => void, appear: boolean = false): () => void {
    if (props.css === false) {
        done();
        return () => { };
    }
    const classes = resolveTransitionClasses(props, phase, appear);
    const addC = (c: string) => { if (c) c.split(/\s+/).forEach(x => { if (x) try { el.classList.add(x); } catch { } }); };
    const removeC = (c: string) => { if (c) c.split(/\s+/).forEach(x => { if (x) try { el.classList.remove(x); } catch { } }); };

    let finished = false;
    let guardTimer: any = undefined;
    let endEvent: string | null = null;
    let endHandler: ((e: any) => void) | null = null;

    const cleanup = () => {
        removeC(classes.from);
        removeC(classes.to);
        removeC(classes.active);
        if (guardTimer !== undefined) { try { clearTimeout(guardTimer); } catch { } guardTimer = undefined; }
        if (endEvent && endHandler) { try { el.removeEventListener(endEvent, endHandler); } catch { } endHandler = null; }
    };
    const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        try { done(); } catch { }
    };

    addC(classes.from);
    addC(classes.active);
    try { void (el as HTMLElement).offsetHeight; } catch { }

    const nextFrame = (cb: () => void) => {
        const raf = (globalThis as any).requestAnimationFrame;
        if (typeof raf === 'function') { raf(() => cb()); } else { setTimeout(cb, 16); }
    };

    nextFrame(() => {
        if (finished) return;
        removeC(classes.from);
        addC(classes.to);

        let timeout = 0;
        let expectedEnds = 1;
        const dur = props.duration;
        if (typeof dur === 'number') {
            timeout = dur;
            endEvent = props.type === 'animation' ? 'animationend' : 'transitionend';
        } else if (dur && typeof dur === 'object') {
            timeout = (phase === 'enter' ? dur.enter : dur.leave) ?? 0;
            endEvent = props.type === 'animation' ? 'animationend' : 'transitionend';
        } else {
            const info = getTransitionInfoFromElement(el, props.type);
            timeout = info.timeout;
            expectedEnds = info.propCount || 1;
            endEvent = info.type === 'animation' ? 'animationend' : 'transitionend';
        }

        if (!timeout || timeout <= 0) {
            finish();
            return;
        }

        let ended = 0;
        endHandler = (e: any) => {
            if (e && e.target !== el) return;
            if (++ended >= expectedEnds) finish();
        };
        try { el.addEventListener(endEvent, endHandler); } catch { }
        guardTimer = setTimeout(finish, timeout + 60);
    });

    return finish;
}