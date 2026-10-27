import * as t from '@babel/types';
import { NodePath } from '@babel/core';

export const STORE_FACTORIES = new Set(['reactive', 'useModel', 'createSignal', 'createComputed', 'createLazyComputed']);
export const STORE_FACTORY_PATTERN = /\b(?:reactive|useModel|createSignal|createComputed|createLazyComputed)\b/;

const NAME_LOCAL = '_motifName';

export function isCoreFactory(call: t.Node | null | undefined, scope: NodePath['scope']): boolean {
    if (!t.isCallExpression(call) || !t.isIdentifier(call.callee)) return false;
    const binding = scope.getBinding(call.callee.name);
    if (!binding || binding.kind !== 'module' || !binding.path.isImportSpecifier()) return false;
    const declaration = binding.path.parentPath;
    if (!declaration?.isImportDeclaration() || declaration.node.source.value !== '@motifx/core') return false;
    const imported = binding.path.node.imported;
    return STORE_FACTORIES.has(t.isIdentifier(imported) ? imported.name : imported.value);
}

export const storeNamesPlugin = (label: string, outcome: { named: boolean } = { named: false }) => () => ({
    name: 'motifjs-store-names',
    visitor: {
        Program(program: NodePath<t.Program>) {
            let named = false;
            for (const statement of program.get('body')) {
                const declaration = statement.isExportNamedDeclaration() ? statement.get('declaration') : statement;
                if (!declaration.isVariableDeclaration()) continue;
                const calls: t.Statement[] = [];
                for (const d of declaration.node.declarations) {
                    if (!t.isIdentifier(d.id) || !isCoreFactory(d.init, program.scope)) continue;
                    calls.push(t.expressionStatement(t.callExpression(t.identifier(NAME_LOCAL), [
                        t.identifier(d.id.name), t.stringLiteral(d.id.name), t.stringLiteral(label),
                    ])));
                }
                if (calls.length === 0) continue;
                statement.insertAfter(calls);
                named = true;
            }
            if (!named) return;
            outcome.named = true;
            program.unshiftContainer('body', t.importDeclaration(
                [t.importSpecifier(t.identifier(NAME_LOCAL), t.identifier('nameModuleStore'))],
                t.stringLiteral('@motifx/core/devtools'),
            ));
        },
    },
});
