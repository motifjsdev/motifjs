export class RouterViewRegistry {
    private static outlets: Map<string, Map<string, any>> = new Map();
    static register(name: string, scopeId: string, instance: any) {
        if (!this.outlets.has(name)) this.outlets.set(name, new Map());
        this.outlets.get(name)!.set(scopeId, instance);
    }
    static unregister(name: string, scopeId: string) {
        this.outlets.get(name)?.delete(scopeId);
        if (this.outlets.get(name)?.size === 0) this.outlets.delete(name);
    }
    static find(name: string, scopeId?: string): any | null {
        if (scopeId && this.outlets.get(name)?.has(scopeId)) {
            return this.outlets.get(name)!.get(scopeId);
        }
        const group = this.outlets.get(name);
        if (group && group.size > 0) return Array.from(group.values())[0];
        return null;
    }
    static findAll(name: string): any[] {
        return Array.from(this.outlets.get(name)?.values() ?? []);
    }
}