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
    | { type: 'reactivity:flush'; payload: { duration: number; runs: number; triggers: { target: unknown; key: string; count: number }[]; effects: { path: DevtoolsPath | null; type: string | null; tag: string | null; kind: string; runs: number }[] } }
    | { type: 'route:navigation-start'; payload: { uri: string } }
    | { type: 'route:navigation-end'; payload: { uri: string; requested: string; outcome: 'done' | 'skipped' | 'cancelled' | 'notFound' | 'error'; reason?: string; params?: unknown; duration: number } }
    | { type: `ext:${string}`; payload?: unknown };

export interface MotifDevtools {
    readonly version: 1;
    on(listener: (event: DevtoolsEvent) => void): () => void;
    isEnabled(): boolean;
    getTree(path?: DevtoolsPath, depth?: number): DevtoolsTreeNode | null;
    getElement(path: DevtoolsPath): Node | null;
    pathOfElement(node: Node | null): DevtoolsPath | null;
    inspect(path: DevtoolsPath): (Omit<DevtoolsTreeNode, 'children'> & { props: Record<string, unknown>; functionProps?: Record<string, unknown>; bindings: unknown[]; events: unknown[]; hooks: unknown[]; classes: { static: string[]; reactive: { id: string; classes: string[] }[] }; attributes: unknown[]; services: unknown; effects: unknown[]; extensions: Record<string, unknown> }) | null;
    getServices(): { token: string; lifetime: string; created: boolean }[];
    getCounters(): { components: { live: number; inTree: number; notInTree: number; byType: Record<string, number> }; bindings: number; listeners: { dom: number; component: number }; effects: { live: number; owned: number }; reactivity: { runs: number; flushes: number; flushRuns: number; lastFlushDuration: number; maxFlushDuration: number } };
    getWarnings(): { code: string; message: string; details?: unknown; count: number; firstAt: number; lastAt: number }[];
    getErrors(): { context: string; name: string; message: string; error: unknown; count: number; firstAt: number; lastAt: number }[];
    getRoutes(): unknown;
    getRoute(): { uri: string; params: unknown; chain: string[] } | null;
    getNavigations(): { requested: string; uri: string | null; outcome: string; reason?: string; params?: unknown; duration: number; at: number }[];
    getStores(): { name: string; value: unknown; type: string }[];
    getExtensions(): string[];
    readExtension(name: string): unknown;
    setClass(path: DevtoolsPath, name: string, on: boolean): DevtoolsResult;
    setAttribute(path: DevtoolsPath, name: string, value: string | null): DevtoolsResult;
    setVisible(path: DevtoolsPath, visible: boolean): Promise<DevtoolsResult>;
    writeModel(path: DevtoolsPath, value: unknown): DevtoolsResult;
    setProp(path: DevtoolsPath, keys: string[], value: unknown): DevtoolsResult;
    navigate(uri: string): Promise<DevtoolsResult>;
    setStoreValue(index: number, keys: string[], value: unknown): DevtoolsResult;
}
