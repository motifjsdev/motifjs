#!/usr/bin/env node
/*
 * motif-lint — type-aware checks (MJX005: ternary passed to a prop that is not Bind<T>;
 *              MJX015: class component override that does not reach super on every path)
 *
 *   npx motif-lint [--project tsconfig.json] [--json] [--no-fail] [file.tsx …]
 *
 * Builds the TypeScript program and reports a ternary written to a component prop whose
 * declared type does not accept a function (the compiler always wraps a ternary in a getter),
 * and an override of a ComponentBase method or accessor that can finish without reaching super.
 * Exits with code 1 when there are findings (0 with `--no-fail`).
 */
const compiler = require('../dist/index.cjs');

const args = process.argv.slice(2);
let project = 'tsconfig.json', json = false, fail = true;
const files = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project' || a === '-p') project = args[++i];
    else if (a === '--json') json = true;
    else if (a === '--no-fail') fail = false;
    else if (a === '-h' || a === '--help') { console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
    else files.push(a);
}

const t0 = Date.now();
const list = compiler.lintProject({ project, files: files.length ? files : undefined });
if (json) {
    process.stdout.write(JSON.stringify(list, null, 2) + '\n');
} else {
    compiler.printDiagnostics(list);
    console.error(`[motifjs] lint: ${list.length} findings (${Date.now() - t0} ms)`);
}
process.exit(list.length && fail ? 1 : 0);
