import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const bin = path.join(__dirname, '..', 'bin', 'motif-explain.cjs');
const dist = path.join(__dirname, '..', 'dist', 'index.cjs');

function run(args: string[], cwd: string) {
    const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
    return { status: r.status, out: r.stdout, err: r.stderr };
}

describe('motif-explain CLI', () => {
    let dir: string;

    beforeAll(() => {
        if (!fs.existsSync(dist)) throw new Error('motif-explain runs on the built dist: run `npm run build` in packages/compiler first');
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-explain-'));
        fs.writeFileSync(path.join(dir, 'Row.tsx'), 'class Row { x = 1; view(){ return <div title={this.x}>{this.x}</div>; } }\n');
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('--json prints the explanation list', () => {
        const { status, out } = run(['Row.tsx', '--json'], dir);
        expect(status).toBe(0);
        const parsed = JSON.parse(out);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.some((e: any) => e.site === 'attr')).toBe(true);
    });

    test('--json --code prints the list and the generated code per file', () => {
        const { status, out } = run(['Row.tsx', '--json', '--code'], dir);
        expect(status).toBe(0);
        const parsed = JSON.parse(out);
        expect(Array.isArray(parsed.explanations)).toBe(true);
        expect(parsed.explanations.some((e: any) => e.site === 'attr')).toBe(true);
        expect(Object.keys(parsed.code)).toEqual(['Row.tsx']);
        expect(parsed.code['Row.tsx']).toContain('sender.attr.add(');
    });

    test('--code without --json appends the generated code to the readable dump', () => {
        const { status, out } = run(['Row.tsx', '--code'], dir);
        expect(status).toBe(0);
        expect(out).toContain('--- generated code ---');
        expect(out).toContain('sender.attr.add(');
    });
});
