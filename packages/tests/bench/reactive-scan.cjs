const { reactive, effect } = require('../../motifjs/dist/index.cjs');
const { debugGetDeps } = require('../../motifjs/dist/devtools.cjs');

const sizes = process.argv.slice(2).map(Number).filter(n => n > 0);
if (sizes.length === 0) sizes.push(500, 1000, 2000);

const ms = (t) => t.toFixed(1).padStart(8);
const num = (n) => String(n).padStart(9);

function subscriptionsOf(target) {
    const deps = debugGetDeps(target);
    if (!deps) return { keys: 0, subs: 0 };
    let subs = 0;
    for (const set of deps.values()) subs += set.size;
    return { keys: deps.size, subs };
}

function itemSubscriptions(list) {
    let subs = 0;
    for (const item of list) subs += subscriptionsOf(item).subs;
    return subs;
}

async function timed(label, run, counter) {
    counter.runs = 0;
    const start = performance.now();
    run();
    await Promise.resolve();
    await Promise.resolve();
    return { label, time: performance.now() - start, runs: counter.runs };
}

const rows = {
    'find by id':        (store, i) => { const item = store.list.find(x => x.id === i); return item ? item.value : 0; },
    'findIndex by id':   (store, i) => { const at = store.list.findIndex(x => x.id === i); return at < 0 ? 0 : store.list[at].value; },
    'includes(item)':    (store, i, items) => (store.list.includes(items[i]) ? items[i].value : 0),
    'direct list[i]':    (store, i) => store.list[i].value,
};

async function scenario(name, read, n) {
    const items = Array.from({ length: n }, (_, i) => ({ id: i, name: 'item ' + i, value: 0 }));
    const store = reactive({ list: items });
    const counter = { runs: 0 };
    const stops = [];
    const setup = await timed('setup', () => {
        for (let i = 0; i < n; i++) stops.push(effect(() => { counter.runs++; read(store, i, items); }));
    }, counter);
    const list = subscriptionsOf(store.list);
    const itemSubs = itemSubscriptions(store.list);
    const middle = n >> 1;
    const writeValue = await timed('write value', () => { store.list[middle].value++; }, counter);
    const writeId = await timed('write id', () => { store.list[middle].id = -1; }, counter);
    const push = await timed('push', () => { store.list.push({ id: n, name: 'new', value: 0 }); }, counter);
    const replace = await timed('replace list', () => { store.list = store.list.slice(); }, counter);
    for (const stop of stops) stop();
    const after = subscriptionsOf(store.list).subs + itemSubscriptions(store.list);
    console.log(`${name.padEnd(18)} n=${String(n).padStart(5)} | setup ${ms(setup.time)} ms | list keys ${num(list.keys)} subs ${num(list.subs)} | item subs ${num(itemSubs)} | write value ${ms(writeValue.time)} ms ${num(writeValue.runs)} runs | write id ${ms(writeId.time)} ms ${num(writeId.runs)} runs | push ${ms(push.time)} ms ${num(push.runs)} runs | replace ${ms(replace.time)} ms ${num(replace.runs)} runs | left after stop ${after}`);
}

(async () => {
    for (const n of sizes) {
        for (const [name, read] of Object.entries(rows)) await scenario(name, read, n);
        console.log('');
    }
})();
