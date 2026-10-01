import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const packageDir = path.resolve(process.argv[2] ?? '.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = process.platform === 'win32';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-pack-'));
let failed = false;

function run(label, cmd, args) {
    console.log(`\n> ${label}`);
    try {
        execFileSync(cmd, args, { cwd: packageDir, stdio: 'inherit', shell });
    } catch {
        failed = true;
        console.error(`✗ ${label} failed`);
    }
}

try {
    const packed = JSON.parse(execFileSync(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', outDir], { cwd: packageDir, encoding: 'utf8', shell }));
    const tarball = path.join(outDir, packed[0].filename);
    console.log(`packed ${packed[0].name}@${packed[0].version}: ${packed[0].entryCount} files, ${(packed[0].size / 1024).toFixed(1)} kB`);

    run('publint', npx, ['--no-install', 'publint', '--strict', tarball]);
    run('are the types wrong', npx, ['--no-install', 'attw', tarball]);
} finally {
    fs.rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
    process.exit(1);
}
console.log('\n✓ package checks passed');
