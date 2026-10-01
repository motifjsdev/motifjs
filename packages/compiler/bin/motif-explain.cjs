#!/usr/bin/env node
/*
 * motif-explain — "what did this expression compile to?" (the compiler's -S flag)
 *
 *   npx motif-explain src/App.tsx [more.tsx…] [--json] [--site child|attr|prop|…] [--code]
 *
 * Compiles the source and prints, for every JSX expression, the actual call it lowers to,
 * its reactivity class and its dependency surface. `--code` also prints the full generated code.
 */
const fs = require('fs');
const path = require('path');
const compiler = require('../dist/index.cjs');

const args = process.argv.slice(2);
const files = [];
let json = false, code = false, site = null;
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--code') code = true;
    else if (a === '--site') site = args[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
    else files.push(a);
}
if (files.length === 0) {
    console.error('usage: motif-explain <file.tsx> [...] [--json] [--site child|attr|prop|event|directive] [--code]');
    process.exit(2);
}

const Compiler = compiler.Compiler;
const all = [];
for (const f of files) {
    const abs = path.resolve(f);
    const src = fs.readFileSync(abs, 'utf8');
    const c = new Compiler();
    const shown = path.relative(process.cwd(), abs).split(path.sep).join('/');
    const result = c.explain(src, shown);
    let list = c.explanations;
    if (site) list = list.filter(e => e.site === site);
    all.push(...list);
    if (!json) {
        process.stdout.write(compiler.formatExplanations(list) + '\n');
        if (c.diagnostics.length) compiler.printDiagnostics(c.diagnostics);
        if (code && result && result.code) process.stdout.write('\n--- generated code ---\n' + result.code + '\n');
    }
}
if (json) process.stdout.write(JSON.stringify(all, null, 2) + '\n');
