import commonJS from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";
import { visualizer } from 'rollup-plugin-visualizer';
import dts from "rollup-plugin-dts";
import fs from "node:fs";
import path from "node:path";

var finalizeTypes = function () {
    return {
        name: 'compiler-finalize-types',
        writeBundle: function () {
            for (const entry of fs.readdirSync('./dist')) {
                const full = path.join('./dist', entry);
                if (fs.statSync(full).isDirectory()) {
                    if (entry !== 'types-bundle') fs.rmSync(full, { recursive: true, force: true });
                } else if ((entry.endsWith('.d.ts') || entry.endsWith('.d.ts.map')) && entry !== 'index.d.ts') {
                    fs.rmSync(full);
                }
            }
            fs.renameSync('./dist/types-bundle/index.d.ts', './dist/index.d.ts');
            fs.rmSync('./dist/types-bundle', { recursive: true, force: true });
            fs.copyFileSync('./dist/index.d.ts', './dist/index.d.cts');
        }
    };
};
var name = 'motif';
var dist = function (p) { return './dist/index.' + p; }

export default [
    {
        input: "src/index.ts",
        output: [
            {
                name: name,
                file: dist("cjs"),
                format: "cjs",
                exports: "named",
                sourcemap: true,
                sourcemapExcludeSources: false,
            }, {
                name: name,
                file: dist("esm.js"),
                format: "esm",
                sourcemap: true,
                sourcemapExcludeSources: false,
            }
        ],
        experimentalCodeSplitting: true,
        plugins: [
            commonJS(),
            typescript({
                declaration: true,
                esModuleInterop: true,
                moduleResolution: "Node",
                target: "ES6",
                module: "ESNext",
                type: "module",
                lib: ["DOM", "ES2021"],
                noEmitHelpers: true,
                importHelpers: false,
                experimentalDecorators: true
            },
            ),
            (process.env.ANALYZE && visualizer({ filename: 'bundle-stats.html', gzipSize: true, brotliSize: true }))
        ],
        onwarn: function (warning) {
            if (warning.code === 'THIS_IS_UNDEFINED') {
                return;
            }
        },
    },
    {
        input: './dist/src/index.d.ts',
        output: { file: './dist/types-bundle/index.d.ts', format: 'es' },
        plugins: [dts(), finalizeTypes()]
    }
];
