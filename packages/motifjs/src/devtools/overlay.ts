import { Application, Component } from '..';
import { getWarnings, on, ensureDevtoolsFlagInitialized, isEnabled, getRoutes } from './devbus';
import { lintRoutes } from './routeLinter';
import { reportWarning } from '../common/diagnostics';
let overlayHost: HTMLDivElement | null = null;
let visible = false;

function render() {
    return;
    // if (!overlayHost) return;
    // const warnings = getWarnings();

    // const bar = document.createElement('div');
    // bar.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 8px; background:#111; color:#fff; border-bottom:1px solid #333;';
    // const title = document.createElement('div');
    // title.style.fontWeight = '600';
    // const closeBtn = document.createElement('button');
    // closeBtn.style.cssText = 'margin-left:auto; background:#333; color:#fff; border:0; padding:2px 6px; cursor:pointer;';

    // const list = document.createElement('div');
    // list.style.cssText = 'max-height:40vh; overflow:auto; padding:8px; background:#181818; color:#ddd; font:12px/1.4 monospace;';
    // for (const w of warnings) {
    //     const item = document.createElement('div');
    //     item.style.cssText = 'padding:6px 8px; border:1px solid #333; border-radius:4px; margin-bottom:6px; background:#1f1f1f;';
    //     const code = document.createElement('div');
    //     code.style.cssText = 'color:#ffb86c; font-weight:700;';
    //     const msg = document.createElement('div');
    //     const det = document.createElement('pre');
    //     det.textContent = w.details ? JSON.stringify(w.details, null, 2) : '';
    //     det.style.cssText = 'white-space:pre-wrap; color:#aaa; margin:6px 0 0 0;';
    //     if (w.details) item.appendChild(det);
}

export function toggle(force?: boolean) {
    if (!overlayHost) return;
    visible = typeof force === 'boolean' ? force : !visible;
    overlayHost.style.display = visible ? 'block' : 'none';
    if (visible) render();
}

export function initOverlayIfEnabled() {
    ensureDevtoolsFlagInitialized();
    if (!isEnabled()) return;
    try {
        if (!overlayHost) {
            overlayHost = document.createElement('div');
            overlayHost.style.cssText = 'position:fixed; left:12px; bottom:12px; right:12px; z-index:2147483647; background:#111; color:#fff; border:1px solid #333; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.4); display:none;';
            document.body.appendChild(overlayHost);
            window.addEventListener('keydown', (e) => {
                try {
                    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
                        e.preventDefault();
                        toggle();
                    }
                } catch { }
            });
            on((ev) => { if (ev.type === 'warning' && visible) render(); });
            const qs = location.search || '';
            if (Application.main.isDevelopmentModeEnabled) toggle(true);
        }
    } catch { }
}

let devBtn: HTMLButtonElement | null = null;
let inAppPanelMounted = false;
function ensureInAppPanel() {
    if (inAppPanelMounted) return;
    try {
        (async () => {
            try {
                //var mod = await import("@motifjs/devtools-inapp");

                //const mod = mountInAppPanel;//await (Function('return import("@motifjs/devtools-inapp")')() as Promise<any>);

                //if (mod && typeof mod.mountInAppPanel === 'function') {
            } catch (err) {
                reportWarning('MJX611', [], err);
            }
        })();
    } catch { }
}
export function initDevtoolsButton() {
    try {

        if (typeof document === 'undefined') return;
        if (devBtn) return;
        devBtn = document.createElement('button');
        devBtn.setAttribute('type', 'button');
        devBtn.setAttribute('aria-label', 'Open MotifJS DevTools');
        devBtn.textContent = 'Dev';
        devBtn.style.cssText = [
            'position:fixed',
            'right:12px',
            'bottom:12px',
            'z-index:2147483646',
            'width:40px',
            'height:40px',
            'border-radius:20px',
            'border:1px solid #333',
            'background:#111',
            'color:#fff',
            'font-weight:700',
            'cursor:pointer',
            'box-shadow:0 4px 10px rgba(0,0,0,0.35)'
        ].join(';');
        devBtn.onclick = () => {
            try {
                (window as any).__motif_DEVTOOLS = true;
            } catch { }
            try {
                ensureDevtoolsFlagInitialized();
                initOverlayIfEnabled();
                toggle(true);
                ensureInAppPanel();
                try {
                    const rs = getRoutes();
                    if (rs) lintRoutes(rs);
                } catch { }
            } catch { }
        };
        document.body.appendChild(devBtn);
        try { const qs = location.search || ''; if (Application.main.isDevelopmentModeEnabled) ensureInAppPanel(); } catch { }
    } catch { }
}