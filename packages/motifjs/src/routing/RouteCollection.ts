import { RouteItem, RouteRecord } from "./RouteItem";
import { Scanner } from "./scanner";


/** Bir fullPath'in statik (parametresiz) ve parametreli segment sayıları. */
export function routeSpecificity(fullPath: string): { statics: number; params: number } {
    let statics = 0, params = 0;
    for (const seg of (fullPath || '').split('/')) {
        if (!seg) continue;
        if (seg.startsWith('{') && seg.endsWith('}')) params++; else statics++;
    }
    return { statics, params };
}

export function compareRouteRecords(a: RouteRecord, b: RouteRecord): number {
    const d = a.chain.length - b.chain.length;
    if (d !== 0) return d;
    const sa = routeSpecificity(a.fullPath), sb = routeSpecificity(b.fullPath);
    if (sa.statics !== sb.statics) return sb.statics - sa.statics;
    if (sa.params !== sb.params) return sa.params - sb.params;
    return b.fullPath.length - a.fullPath.length;
}

export class RouteCollection {

    public records: RouteRecord[] = [];
    private routesMap: Map<any, RouteItem> = new Map();
    constructor(private routes: RouteItem[]) {
        this.build();
    }

    private build() {
        this.records = [];
        this.routesMap.clear();

        for (const r of this.routes) this.walk([], "", r);

        this.records.sort(compareRouteRecords);
    }

    walk = (chain: RouteItem[], parentPath: string, node: RouteItem, viaAlias: boolean = false) => {
        const fullPath = this.joinPaths(parentPath, node.path);
        if (!viaAlias) {
            const existing = (node as any).fullPath as string | null | undefined;
            if (existing == null || (typeof existing === 'string' && existing.trim() === '')) {
                (node as any).fullPath = fullPath;
            }
            if (node.name != null) {
                this.routesMap.set(node.name, node);
            }
        }
        const nextChain = [...chain, node];
        const aliases = node.alias == null ? [] : (Array.isArray(node.alias) ? node.alias : [node.alias]);
        const variants = [
            { path: fullPath, isAlias: viaAlias },
            ...aliases.map(a => ({ path: this.joinPaths(parentPath, a), isAlias: true }))
        ];
        for (const variant of variants) {
            this.records.push({
                fullPath: variant.path,
                chain: nextChain,
                leaf: node,
                scanner: new Scanner(variant.path),
                aliasOf: variant.isAlias ? ((node as any).fullPath ?? null) : null
            });
            if (node.childs && node.childs.length) {
                for (const child of node.childs) this.walk(nextChain, variant.path, child, variant.isAlias);
            }
        }
    }

    joinPaths(parent: string, child: string): string {
        parent = parent || "";
        child = child || "";

        const base = parent && parent !== "/" && parent.endsWith("/") ? parent.slice(0, -1) : parent;

        if (child === "/") {
            return base || "/";
        }

        const seg = child ? (child.startsWith("/") ? child : "/" + child) : "";

        if (!base || base === "/") {
            return seg || "/";
        }
        return base + seg;
    }
}