import { Application, Component, motifFragment, reactive } from '/dist/index.esm.js';

const params = new URLSearchParams(location.search);
const browser = params.get('browser') || 'unknown';
const pageName = params.get('page') || 'attr-hold';
const results = {};
const out = document.getElementById('out');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function record(name, ok, detail) { results[name] = { ok: !!ok, detail: detail == null ? '' : String(detail) }; out.textContent = JSON.stringify(results, null, 1); }

function button(text) {
    const c = new Component('button');
    c.setText(text);
    return c;
}

function disableInside(box) {
    const held = [];
    const walk = (c) => {
        for (const kid of c.controls.items) {
            const el = kid.element;
            if (!el || el.nodeType === 3) continue;
            if (el.nodeType === 1) {
                if ('disabled' in el) held.push(kid.attr.hold({ disabled: true }));
                else if (kid.attr.has('tabindex')) held.push(kid.attr.hold({ tabindex: -1, 'aria-disabled': 'true' }));
            }
            walk(kid);
        }
    };
    walk(box);
    return () => { for (const x of held) x.dispose(); };
}

async function main() {
    const app = Application.CreateBuilder().build();
    app.useRouter({ routes: [{ path: '/a', control: () => new Component('div') }], mode: 'hash' });
    const root = new Component('div');
    app.run(document.getElementById('app'), root);
    await app.navigate('/a');
    await sleep(50);

    const state = reactive({ busy: false, label: 'kendi-a', focus: false });

    let clicks = 0;
    const save = button('Kaydet');
    save.attr.add({ disabled: () => state.busy });
    save.motif.on('click', () => { clicks++; });
    const other = button('Öteki');
    root.controls.add(save); root.controls.add(other);
    await sleep(30);
    save.element.click();
    const held = save.attr.hold({ disabled: true });
    save.element.click();
    other.element.focus();
    save.element.focus();
    record('A1 tutulurken düğme tıklanmaz, :disabled eşleşir, odak almaz', clicks === 1 && save.element.matches(':disabled') && document.activeElement === other.element, `tıklama=${clicks}`);
    state.busy = true; await sleep(20);
    state.busy = false; await sleep(20);
    root.reState(); await sleep(20);
    state.busy = true; await sleep(20);
    state.busy = false; await sleep(20);
    save.element.click();
    record('A2 kendi bağı değişse ve reState çağrılsa da tutma delinmez', clicks === 1 && save.element.matches(':disabled'), `tıklama=${clicks}`);
    held.dispose();
    save.element.click();
    const enabled = !save.element.matches(':disabled');
    state.busy = true; await sleep(20);
    const live = save.element.matches(':disabled');
    state.busy = false; await sleep(20);
    record('A3 bırakınca tıklanır ve kendi bağı yeniden canlıdır', clicks === 2 && enabled && live && !save.element.matches(':disabled'), `tıklama=${clicks}`);

    const box = new Component('div');
    box.class.add('box');
    const busyButton = button('Gönder');
    busyButton.attr.add({ disabled: () => state.busy });
    const custom = new Component('div');
    custom.setText('Özel');
    custom.attr.add({ tabindex: '0', role: 'button' });
    const fixed = new Component('input');
    fixed.attr.add({ type: 'text', disabled: true });
    box.controls.add(busyButton); box.controls.add(custom); box.controls.add(fixed);
    root.controls.add(box);
    await sleep(30);
    const enable = disableInside(box);
    const covered = busyButton.element.disabled && custom.element.tabIndex === -1 && custom.element.getAttribute('aria-disabled') === 'true' && fixed.element.disabled;
    state.busy = true; await sleep(20);
    root.reState(); await sleep(20);
    state.busy = false; await sleep(20);
    record('B1 kap devre dışıyken içindeki her bileşen örtülü kalır', covered && busyButton.element.disabled && custom.element.tabIndex === -1,
        `tabIndex=${custom.element.tabIndex}`);
    enable();
    record('B2 kap açılınca her bileşen kendi değerine döner', !busyButton.element.disabled && custom.element.tabIndex === 0 && !custom.element.hasAttribute('aria-disabled')
        && custom.element.getAttribute('role') === 'button' && fixed.element.disabled, `tabindex=${custom.element.getAttribute('tabindex')}`);

    const supportsInert = 'inert' in HTMLElement.prototype;
    const zone = new Component('div');
    const inner = button('İçeride');
    zone.controls.add(inner);
    root.controls.add(zone);
    await sleep(30);
    const inert = zone.attr.hold({ inert: true });
    other.element.focus();
    inner.element.focus();
    const blocked = document.activeElement !== inner.element;
    inert.dispose();
    inner.element.focus();
    record('C inert tutulurken içerideki düğme odak almaz, bırakınca alır', (!supportsInert || blocked) && document.activeElement === inner.element && !zone.element.hasAttribute('inert'),
        `inert destekli=${supportsInert}`);

    const supportsAria = 'ariaLabel' in Element.prototype;
    const labelled = new Component('div');
    labelled.bindings.add('ariaLabel', () => state.label);
    root.controls.add(labelled);
    await sleep(30);
    const before = labelled.element.getAttribute('aria-label');
    const label = labelled.attr.hold({ 'aria-label': 'tutulan' });
    state.label = 'kendi-b'; await sleep(20);
    const during = labelled.element.getAttribute('aria-label');
    label.dispose();
    record('D eleman özelliğine yazan bağ tutmayı delmez, bırakınca güncel değeri gelir', !supportsAria || (before === 'kendi-a' && during === 'tutulan' && labelled.element.getAttribute('aria-label') === 'kendi-b'),
        `ariaLabel destekli=${supportsAria}, sırasında=${during}, sonra=${labelled.element.getAttribute('aria-label')}`);

    const first = button('Bir');
    const second = button('İki');
    second.attr.add({ focus: () => state.focus });
    root.controls.add(first); root.controls.add(second);
    await sleep(30);
    first.element.focus();
    const focus = second.attr.hold({ focus: false });
    state.focus = true; await sleep(30);
    const kept = document.activeElement === first.element;
    focus.dispose(); await sleep(30);
    record('E tutulurken bileşenin kendi odak isteği çalışmaz, bırakınca çalışır', kept && document.activeElement === second.element);

    const field = new Component('input');
    root.controls.add(field);
    await sleep(30);
    field.element.value = 'yazılan';
    const value = field.attr.hold({ value: 'örtü' });
    const shown = field.element.value;
    value.dispose();
    record('F kullanıcının yazdığı değer örtülür ve aynen geri gelir', shown === 'örtü' && field.element.value === 'yazılan', `sırasında=${shown}, sonra=${field.element.value}`);

    const panel = new Component('div');
    panel.class.add('box');
    const dialog = new Component('div');
    dialog.class.add('window');
    const okButton = button('Tamam');
    const group = motifFragment();
    const groupButton = button('Grup');
    const panelButton = button('Kutu');
    const counts = { ok: 0, group: 0, panel: 0 };
    okButton.motif.on('click', () => { counts.ok++; });
    groupButton.motif.on('click', () => { counts.group++; });
    panelButton.motif.on('click', () => { counts.panel++; });
    dialog.controls.add(okButton);
    group.controls.add(groupButton);
    panel.controls.add(dialog); panel.controls.add(group); panel.controls.add(panelButton);
    root.controls.add(panel);
    await sleep(30);
    let locked = true;
    let last = null;
    panel.motif.on('click:capture', (_sender, e) => {
        if (!locked) return;
        if (dialog.motif.isEventFrom(e) || group.motif.isEventFrom(e)) { last = e; return; }
        e.preventDefault();
        e.stopImmediatePropagation();
    });
    okButton.element.click();
    groupButton.element.click();
    panelButton.element.click();
    record('G1 kilitli kapta pencereden ve elemansız gruptan gelen tıklama geçer, ötekiler yutulur', counts.ok === 1 && counts.group === 1 && counts.panel === 0, JSON.stringify(counts));
    await sleep(0);
    record('G2 olay bittikten sonra sorulunca da cevap aynı', last.composedPath().length === 0 && group.motif.isEventFrom(last) && panel.motif.isEventFrom(last) && !dialog.motif.isEventFrom(last),
        `yol=${last.composedPath().length}`);
    locked = false;
    panelButton.element.click();
    record('G3 kilit kalkınca kutunun düğmesi çalışır', counts.panel === 1, JSON.stringify(counts));

    const shadows = {};
    for (const mode of ['open', 'closed']) {
        const wrap = new Component('div');
        root.controls.add(wrap);
        await sleep(20);
        const hostEl = document.createElement('div');
        wrap.element.appendChild(hostEl);
        const shadow = hostEl.attachShadow({ mode });
        const el = document.createElement('button');
        shadow.appendChild(el);
        const inside = new Component(el);
        const seen = {};
        el.addEventListener('click', (e) => { seen.inside = [wrap.motif.isEventFrom(e), inside.motif.isEventFrom(e)]; });
        const listen = (e) => { seen.outside = [wrap.motif.isEventFrom(e), inside.motif.isEventFrom(e)]; };
        document.addEventListener('click', listen);
        el.click();
        document.removeEventListener('click', listen);
        shadows[mode] = seen;
    }
    record('H1 açık gölge kökte olayın kaynağı iki yandan da bulunur', JSON.stringify(shadows.open) === JSON.stringify({ inside: [true, true], outside: [true, true] }), JSON.stringify(shadows.open));
    record('H2 kapalı gölge kökte dışarıdaki dinleyici içeriyi göremez, içerideki görür', JSON.stringify(shadows.closed) === JSON.stringify({ inside: [true, true], outside: [true, false] }), JSON.stringify(shadows.closed));

    if (typeof window.gc === 'function') {
        const refs = [];
        const handles = [];
        await (async () => {
            const temp = new Component('div');
            root.controls.add(temp);
            for (let i = 0; i < 50; i++) {
                const b = button('x');
                b.attr.add({ disabled: () => state.busy });
                temp.controls.add(b);
                handles.push(b.attr.hold({ disabled: true, tabindex: -1 }));
                refs.push(new WeakRef(b));
            }
            await sleep(30);
            await temp.dispose();
        })();
        for (let i = 0; i < 6; i++) { window.gc(); await sleep(30); }
        const alive = refs.filter(x => x.deref() !== undefined).length;
        for (const x of handles) x.dispose();
        record('I tutulurken serbest bırakılan bileşen, tutan handle elde olsa da toplanır', alive === 0, `kalan ${alive}/50`);
    } else {
        record('I tutulurken serbest bırakılan bileşen, tutan handle elde olsa da toplanır', true, 'bu tarayıcıda gc() yok, atlandı');
    }
}

main().catch(e => record('HATA', false, (e && e.stack) || String(e))).finally(async () => {
    await fetch(`/report?browser=${browser}&page=${pageName}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ua: navigator.userAgent, results }) });
    out.textContent += '\nraporlandı';
});
