let root: any = null;

export function setTreeRoot(c: any): void { root = c; }
export function clearTreeRoot(c: any): void { if (root === c) root = null; }

export type TreeNode = {
    path: number[]; type: string; tag: string;
    built: boolean; visible: boolean; waiting: boolean; disposed: boolean; connected: boolean;
    childCount: number; children?: TreeNode[];
};

export function tagOf(c: any): string {
    const n = c.element as Node | null;
    return !n ? '' : n.nodeType === 8 ? '#fragment' : n.nodeType === 3 ? '#text' : String(n.nodeName).toLowerCase();
}

export function pathOf(c: any): number[] | null {
    const path: number[] = [];
    let cur = c;
    while (cur.parent) {
        const i = cur.parent._controls?.items.indexOf(cur) ?? -1;
        if (i < 0) return null;
        path.push(i);
        cur = cur.parent;
    }
    return path.reverse();
}

export function componentAt(path: number[]): any | null {
    let cur = root;
    for (const i of path) {
        if (cur === null) return null;
        cur = cur._controls?.items[i] ?? null;
    }
    return cur;
}

function nodeOf(c: any, path: number[], depth: number): TreeNode {
    const items: any[] = c._controls?.items ?? [];
    const out: TreeNode = {
        path, type: c.constructor?.name ?? '', tag: tagOf(c),
        built: !!c.isBuilt, visible: !!c.isVisible, waiting: !!c.isWait, disposed: !!c.isDisposed,
        connected: !!(c.element as any)?.isConnected,
        childCount: items.length,
    };
    if (depth > 0) out.children = items.map((ch, i) => nodeOf(ch, [...path, i], depth - 1));
    return out;
}

export function getTree(path: number[] = [], depth: number = Infinity): TreeNode | null {
    const c = componentAt(path);
    return c === null ? null : nodeOf(c, path.slice(), depth);
}

export function getElement(path: number[]): Node | null {
    return componentAt(path)?.element ?? null;
}

export function pathOfElement(node: Node | null): number[] | null {
    if (root === null || !node) return null;
    const byNode = new Map<Node, number[]>();
    const walk = (c: any, path: number[]) => {
        if (c.element) byNode.set(c.element, path);
        const items: any[] = c._controls?.items ?? [];
        for (let i = 0; i < items.length; i++) walk(items[i], [...path, i]);
    };
    walk(root, []);
    for (let n: Node | null = node; n; n = n.parentNode) {
        const p = byNode.get(n);
        if (p) return p;
    }
    return null;
}
