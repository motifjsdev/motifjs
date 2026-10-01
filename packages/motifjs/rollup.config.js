import commonJS from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';
import dts from "rollup-plugin-dts";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

var name = 'motif';

var isPrivateMember = function (member) {
    return !!member.modifiers && member.modifiers.some(function (m) { return m.kind === ts.SyntaxKind.PrivateKeyword; });
};

var stripUnderscoreMembers = function () {
    return {
        name: 'motif-strip-underscore-members',
        transform: function (code, id) {
            if (!/\.d\.ts$/.test(id)) return null;
            var source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true);
            var ranges = [];
            var visit = function (node) {
                if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
                    node.members.forEach(function (member) {
                        var memberName = member.name;
                        if (memberName && ts.isIdentifier(memberName) && memberName.text.charAt(0) === '_' && !isPrivateMember(member)) {
                            ranges.push([member.getFullStart(), member.getEnd()]);
                        }
                    });
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
            if (ranges.length === 0) return null;
            ranges.sort(function (a, b) { return a[0] - b[0]; });
            var out = '';
            var cursor = 0;
            ranges.forEach(function (range) {
                if (range[0] < cursor) return;
                out += code.slice(cursor, range[0]);
                cursor = range[1];
            });
            out += code.slice(cursor);
            return { code: out, map: null };
        }
    };
};

var externalTypes = function (test, target) {
    return {
        name: 'motif-external-types',
        resolveId: function (source, importer) {
            return test(source, importer || '') ? { id: target, external: true } : null;
        }
    };
};

var isRuntimeImport = function (source) {
    return /^\.{1,2}\/(?:.*\/)?jsx-runtime(?:\.js)?$/.test(source);
};

var internalOwnModule = /[\\/](routing[\\/](UrlRoutingModule|RoutingEngine|scanner|RouteCollection)|entries[\\/]internal)$/;

var internalTypesFromIndex = function () {
    return {
        name: 'motif-internal-types',
        resolveId: function (source, importer) {
            if (!importer || !/^\.{1,2}(\/|$)/.test(source)) return null;
            var target = path.resolve(path.dirname(importer), source).replace(/\.d\.ts$/, '').replace(/[\\/]index$/, '');
            if (internalOwnModule.test(target)) return null;
            return { id: './index.js', external: true };
        }
    };
};

var isIndexImportFromRuntime = function (source, importer) {
    return /jsx-runtime\.d\.ts$/.test(importer) && /^\.\/?(?:index)?$/.test(source);
};

var removeStaleChunks = function () {
    if (!fs.existsSync('./dist/chunks')) return;
    var live = ['index.esm.js', 'index.cjs', 'devtools.esm.js', 'devtools.cjs', 'internal.esm.js', 'internal.cjs']
        .filter(function (f) { return fs.existsSync('./dist/' + f); })
        .map(function (f) { return fs.readFileSync('./dist/' + f, 'utf8'); })
        .join('\n');
    fs.readdirSync('./dist/chunks').forEach(function (f) {
        var chunk = f.replace(/\.map$/, '');
        if (live.indexOf('chunks/' + chunk) === -1) fs.rmSync('./dist/chunks/' + f, { force: true });
    });
};

var finalizeTypes = function () {
    return {
        name: 'motif-finalize-types',
        writeBundle: function () {
            var types = fs.readFileSync('./dist/index.d.ts', 'utf8').replace(/\bIterable\$1</g, 'Iterable<');
            fs.writeFileSync('./dist/index.d.ts', types);
            fs.writeFileSync('./dist/index.d.cts', types.split("'./jsx-runtime.js'").join("'./jsx-runtime.cjs'"));
            var runtime = fs.readFileSync('./dist/jsx-runtime.d.ts', 'utf8');
            fs.writeFileSync('./dist/jsx-runtime.d.cts', runtime.split("'./index.js'").join("'./index.cjs'"));
            fs.copyFileSync('./dist/devtools.d.ts', './dist/devtools.d.cts');
            fs.rmSync('./dist/src', { recursive: true, force: true });
            removeStaleChunks();
        }
    };
};

var onwarn = function (warning) {
    if (warning.code === 'THIS_IS_UNDEFINED') {
        return;
    }
};

var plugins = function (statsFile) {
    return [
        commonJS(),
        typescript({
            declaration: true,
            esModuleInterop: true,
            moduleResolution: "Node",
            target: "ES6",
            module: "ESNext",
            lib: ["DOM", "ES2021"],
            noEmitHelpers: true,
            importHelpers: true,
            cacheRoot: './node_modules/.cache/rpt2-' + statsFile.replace(/\.html$/, '')
        }),
        (process.env.ANALYZE && visualizer({ filename: statsFile, gzipSize: true, brotliSize: true }))
    ];
};

var nodeOutput = function (format, ext) {
    return {
        dir: './dist',
        format: format,
        entryFileNames: '[name].' + ext,
        chunkFileNames: 'chunks/core-[hash].' + ext,
        sourcemap: true,
        sourcemapExcludeSources: true
    };
};

var browserOutput = function (file, format, minify) {
    return {
        name: name,
        file: './dist/' + file,
        format: format,
        sourcemap: true,
        sourcemapExcludeSources: true,
        plugins: minify ? [terser()] : []
    };
};

export default [
    {
        input: {
            index: "src/public.ts",
            devtools: "src/entries/devtools.ts",
            internal: "src/entries/internal.ts"
        },
        output: [
            nodeOutput("esm", "esm.js"),
            nodeOutput("cjs", "cjs")
        ],
        plugins: plugins('bundle-stats.html'),
        onwarn: onwarn
    },
    {
        input: "src/public.ts",
        output: [
            browserOutput("index.umd.js", "umd", false),
            browserOutput("index.umd.min.js", "umd", true),
            browserOutput("index.esm.min.js", "esm", true)
        ],
        plugins: plugins('bundle-stats-browser.html'),
        onwarn: onwarn
    },
    {
        input: 'src/jsx-runtime.ts',
        output: [
            {
                file: './dist/jsx-runtime.esm.js',
                format: "esm",
                sourcemap: true,
                sourcemapExcludeSources: true
            },
            {
                file: './dist/jsx-runtime.cjs',
                format: "cjs",
                sourcemap: true,
                sourcemapExcludeSources: true
            }
        ],
        plugins: plugins('bundle-stats-runtime.html'),
        onwarn: onwarn
    },
    {
        input: './dist/src/entries/devtools.d.ts',
        output: { file: './dist/devtools.d.ts', format: 'es' },
        plugins: [stripUnderscoreMembers(), dts()]
    },
    {
        input: './dist/src/jsx-runtime.d.ts',
        output: { file: './dist/jsx-runtime.d.ts', format: 'es' },
        plugins: [externalTypes(isIndexImportFromRuntime, './index.js'), stripUnderscoreMembers(), dts()]
    },
    {
        input: './dist/src/entries/internal.d.ts',
        output: { file: './dist/internal.d.ts', format: 'es' },
        plugins: [internalTypesFromIndex(), stripUnderscoreMembers(), dts()]
    },
    {
        input: './dist/src/public.d.ts',
        output: { file: './dist/index.d.ts', format: 'es' },
        plugins: [externalTypes(isRuntimeImport, './jsx-runtime.js'), stripUnderscoreMembers(), dts(), finalizeTypes()]
    }
];
