import { Application, Component } from '/dist/index.esm.js';

const app = Application.CreateBuilder().build();
app.useRouter({ routes: [{ path: '/a', control: () => new Component('div') }, { path: '/b', control: () => new Component('div') }], mode: 'hash' });
const root = new Component('div');
app.run(document.getElementById('app'), root);
await app.navigate('/a');

const log = [];
class Panel extends Component {
    constructor(name) { super('section'); this.name = name; this.class.add('panel'); this.element.id = name; }
    onMounted() { log.push(`${this.name}:${this.element.ownerDocument === document ? 'page' : 'window'}`); }
}
const strip = new Component('ul');
root.controls.add(strip);
const a = new Panel('a'), b = new Panel('b'), c = new Panel('c');
strip.controls.add(a, b, c);

const button = new Component('button');
button.setText('PiP penceresinde aç');
button.element.id = 'open-pip';
root.controls.add(button);

const state = { supports: app.windows.supports('pip'), handle: null, error: null, log };
window.__pip = {
    state, app, strip, b,
    order: () => strip.controls.items.map(x => x.name).join(''),
};

button.motif.on('click', async () => {
    try {
        state.handle = await app.windows.open(b, { kind: 'pip', fallback: 'none', width: 420, height: 300, title: 'Düzenleyici' });
    } catch (error) {
        state.error = error && (error.code || error.message || String(error));
    }
    document.getElementById('out').textContent = JSON.stringify({ kind: state.handle?.kind, error: state.error }, null, 1);
});
