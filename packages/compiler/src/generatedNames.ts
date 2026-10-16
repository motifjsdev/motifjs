import type { PluginObj } from '@babel/core';
import { Binding, NodePath, Scope } from '@babel/traverse';

const GENERATED_PARAMETER_NAMES = ['sender', 'frame'];

function isJsxContainer(path: NodePath): boolean {
    return path.isJSXElement() || path.isJSXFragment();
}

function crossesJsx(binding: Binding): boolean {
    const declaringScope = binding.scope.path;
    const crosses = (use: NodePath): boolean => {
        const boundary = use.findParent(p => p === declaringScope || isJsxContainer(p));
        return boundary !== null && boundary !== declaringScope;
    };
    return binding.referencePaths.some(crosses) || binding.constantViolations.some(crosses);
}

function renameShadowedBindings(scope: Scope): void {
    for (const name of GENERATED_PARAMETER_NAMES) {
        const binding = scope.getOwnBinding(name);
        if (binding && crossesJsx(binding)) scope.rename(name);
    }
}

export function generatedNamesPlugin(): PluginObj {
    return {
        visitor: {
            Program(program) {
                renameShadowedBindings(program.scope);
                program.traverse({ Scopable(path) { renameShadowedBindings(path.scope); } });
            },
        },
    };
}
