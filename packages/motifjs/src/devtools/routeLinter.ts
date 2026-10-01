import type { RouteItem } from "../routing/RouteItem";
import { reportWarning } from "../common/diagnostics";

type RouteNode = RouteItem & { childs?: RouteItem[] };

function joinPaths(parent: string, child: string): string {
  const p = (parent || '').trim();
  const c = (child || '').trim();
  const base = p && p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
  if (c === '/') {
    return base || '/';
  }
  const seg = c ? (c.startsWith('/') ? c : '/' + c) : '';
  if (!base || base === '/') {
    return seg || '/';
  }
  return base + seg;
}

export function lintRoutes(routes: RouteNode[]): void {
  const seenFull: Map<string, number> = new Map();
  const seenAlias: Map<string, number> = new Map();

  function visit(node: RouteNode, parentPath: string, depth: number) {
    const rawPath = node.path ?? '';
    const path = String(rawPath);
    const full = parentPath === '' ? path : joinPaths(parentPath, path);
    const isDefaultSlash = depth > 0 && path.trim() === '/';
    const isEmptyPath = path.trim() === '';

    if (isEmptyPath) {
      reportWarning('MJX310', [parentPath || '/'], { parentPath, path });
    }

    if (depth > 0 && path.length > 0 && path !== '/' && !path.startsWith('/') && !path.startsWith('*')) {
      reportWarning('MJX311', [path, parentPath || '/'], { parentPath, path });
    }

    if (parentPath && full === parentPath) {
      if (!isDefaultSlash && !isEmptyPath) {
        reportWarning('MJX312', [full], { parentPath, childPath: path });
      }
    }

    const cnt = (seenFull.get(full) || 0) + 1;
    seenFull.set(full, cnt);
    if (cnt > 1) {
      if (!isDefaultSlash && !isEmptyPath) {
        reportWarning('MJX313', [full], { full });
      }
    }

    const aliases = node.alias == null ? [] : (Array.isArray(node.alias) ? node.alias : [node.alias]);
    for (const rawAlias of aliases) {
      const alias = String(rawAlias ?? '');
      if (depth > 0 && alias.length > 0 && alias !== '/' && !alias.startsWith('/') && !alias.startsWith('*')) {
        reportWarning('MJX314', [alias, parentPath || '/'], { parentPath, alias });
      }
      const aliasFull = parentPath === '' ? alias : joinPaths(parentPath, alias);
      if (aliasFull === full) {
        reportWarning('MJX315', [aliasFull], { full, alias });
      }
      const aliasCount = (seenAlias.get(aliasFull) || 0) + 1;
      seenAlias.set(aliasFull, aliasCount);
      if (aliasCount > 1) {
        reportWarning('MJX316', [aliasFull], { aliasFull });
      }
    }


    const children = (node as any).childs as RouteNode[] | undefined;
    if (Array.isArray(children)) {
      for (const ch of children) visit(ch, full, depth + 1);
    }
  }

  for (const r of routes) visit(r as RouteNode, '', 0);
}