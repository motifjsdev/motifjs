export type DevtoolsPath = number[];
export type DevtoolsResult = { ok: true; value?: unknown } | { ok: false; error: string };
export type DevtoolsComponentRef = { path: DevtoolsPath | null; type: string; tag: string };

export type DevtoolsTreeNode = DevtoolsComponentRef & {
    path: DevtoolsPath; built: boolean; visible: boolean; waiting: boolean; disposed: boolean;
    connected: boolean; childCount: number; children?: DevtoolsTreeNode[];
};

export type DevtoolsEvent =
    | { type: 'warning'; payload: { code: string; message: string; details?: unknown } }
    | { type: 'error:caught'; payload: { context: string; error: unknown } }
    | { type: 'tree:changed'; payload: { parents: DevtoolsPath[] } }
    | { type: 'component:built'; payload: DevtoolsComponentRef & { duration: number } }
    | { type: 'component:visibility'; payload: DevtoolsComponentRef & { visible: boolean } }
    | { type: 'component:wait'; payload: DevtoolsComponentRef & { waiting: boolean } }
    | { type: 'component:disposing'; payload: DevtoolsComponentRef }
    | { type: 'component:disposed'; payload: DevtoolsComponentRef & { duration?: number } }
    | { type: 'reactivity:flush'; payload: { duration: number; runs: number; triggers: { target: unknown; key: string; count: number; store?: { id: number; path: string[] } }[]; effects: { path: DevtoolsPath | null; type: string | null; tag: string | null; kind: string; runs: number }[] } }
    | { type: 'route:navigation-start'; payload: { uri: string } }
    | { type: 'route:navigation-end'; payload: { uri: string; requested: string; outcome: 'done' | 'skipped' | 'cancelled' | 'notFound' | 'error'; reason?: string; params?: unknown; duration: number } }
    | { type: 'stores:changed'; payload: Record<string, never> }
    | { type: 'scopes:changed'; payload: Record<string, never> }
    | { type: 'documents:changed'; payload: Record<string, never> }
    | { type: 'service:created'; payload: { scope: number; token: string; lifetime: string; source: 'class' | 'factory' | 'value'; instance: unknown } }
    | { type: 'service:disposed'; payload: { scope: number; token: string; lifetime: string; instance: unknown } }
    | { type: `ext:${string}`; payload?: unknown };

export type DevtoolsStoreHolder =
    | { kind: 'component'; path: DevtoolsPath; type: string; field: string }
    | { kind: 'service'; token: string; lifetime: string; field: string | null };

export interface MotifDevtools {
    readonly version: 2;
    readonly coreVersion: string;
    on(listener: (event: DevtoolsEvent) => void): () => void;
    isEnabled(): boolean;
    getTree(path?: DevtoolsPath, depth?: number): DevtoolsTreeNode | null;
    getElement(path: DevtoolsPath): Node | null;
    pathOfElement(node: Node | null): DevtoolsPath | null;
    getDocuments(): Document[];
    inspect(path: DevtoolsPath): (Omit<DevtoolsTreeNode, 'children'> & { props: Record<string, unknown>; fields: Record<string, unknown>; functionProps?: Record<string, unknown>; bindings: unknown[]; events: unknown[]; hooks: unknown[]; classes: { static: string[]; reactive: { id: string; classes: string[] }[] }; attributes: unknown[]; services: unknown; effects: unknown[]; extensions: Record<string, unknown>; window?: { kind: string; title: string; open: boolean; components: number } }) | null;
    getServices(): { token: string; lifetime: string; created: boolean }[];
    getScopes(): { id: number; kind: 'root' | 'navigation' | 'user'; name: string | null; parent: number | null; current: boolean; pending: boolean; pins: number; services: { token: string; lifetime: string; instance: unknown; creating?: true }[]; transients: unknown[] }[];
    getCounters(): { components: { live: number; inTree: number; notInTree: number; byType: Record<string, number> }; bindings: number; listeners: { dom: number; component: number }; effects: { live: number; owned: number }; reactivity: { runs: number; flushes: number; flushRuns: number; lastFlushDuration: number; maxFlushDuration: number } };
    getWarnings(): { code: string; message: string; details?: unknown; count: number; firstAt: number; lastAt: number }[];
    getErrors(): { context: string; name: string; message: string; error: unknown; count: number; firstAt: number; lastAt: number }[];
    getRoutes(): unknown;
    getRoute(): { uri: string; params: unknown; chain: string[] } | null;
    getNavigations(): { requested: string; uri: string | null; outcome: string; reason?: string; params?: unknown; duration: number; at: number }[];
    getStores(): { id: number; name: string; file?: string; type: 'reactive' | 'signal' | 'computed'; value: unknown; stale?: boolean; released?: boolean; holders: DevtoolsStoreHolder[] }[];
    getExtensions(): string[];
    readExtension(name: string): unknown;
    readValue(path: DevtoolsPath, source: 'props' | 'functionProps' | 'fields', keys: string[]): DevtoolsResult;
    readStore(id: number, keys: string[]): DevtoolsResult;
    readService(scope: number, token: string, keys: string[]): DevtoolsResult;
    setClass(path: DevtoolsPath, name: string, on: boolean): DevtoolsResult;
    setAttribute(path: DevtoolsPath, name: string, value: string | null): DevtoolsResult;
    setVisible(path: DevtoolsPath, visible: boolean): Promise<DevtoolsResult>;
    writeModel(path: DevtoolsPath, value: unknown): DevtoolsResult;
    setProp(path: DevtoolsPath, keys: string[], value: unknown): DevtoolsResult;
    navigate(uri: string): Promise<DevtoolsResult>;
    setStoreValue(id: number, keys: string[], value: unknown): DevtoolsResult;
}
