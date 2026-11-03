import { reactive } from '@motifx/core';

const gcAvailable = typeof (globalThis as any).gc === 'function';
const testGc = gcAvailable ? test : test.skip;

const ROUNDS = 300000;
const LIMIT = 2 * 1024 * 1024;

async function heapAfterGC() {
    for (let i = 0; i < 5; i++) {
        (globalThis as any).gc();
        await new Promise(r => setTimeout(r, 0));
    }
    return process.memoryUsage().heapUsed;
}

async function retainedBy(run: (rounds: number) => void) {
    run(1000);
    const before = await heapAfterGC();
    run(ROUNDS);
    return (await heapAfterGC()) - before;
}

describe('memory / repeated array operations', () => {
    testGc('push and pop on a reactive array leave nothing behind', async () => {
        const list = reactive([] as number[]);
        const retained = await retainedBy((rounds) => {
            for (let i = 0; i < rounds; i++) { list.push(i); list.pop(); }
        });
        expect(retained).toBeLessThan(LIMIT);
    });

    testGc('reading an array method without calling it leaves nothing behind', async () => {
        const list = reactive([1, 2, 3]);
        let method: unknown;
        const retained = await retainedBy((rounds) => {
            for (let i = 0; i < rounds; i++) { method = list.push; method = list.sort; }
        });
        expect(typeof method).toBe('function');
        expect(retained).toBeLessThan(LIMIT);
    });

    testGc('unshift, shift and splice on a reactive array leave nothing behind', async () => {
        const list = reactive([{ id: 0 }, { id: 1 }, { id: 2 }]);
        const item = { id: 9 };
        const retained = await retainedBy((rounds) => {
            for (let i = 0; i < rounds; i++) {
                list.unshift(item);
                list.shift();
                list.splice(1, 0, item);
                list.splice(1, 1);
            }
        });
        expect(list.length).toBe(3);
        expect(retained).toBeLessThan(LIMIT);
    });
});
