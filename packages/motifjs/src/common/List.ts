export class List<T>{
    
    public ItemAdded!: (i: T) => void;
    public ItemAddedBefore!: (i: T) => void;
    public ItemSplice!: (start:any, i: T) => void;
    private __list: Array<T> = [];
    private _map = new Set<T>();
    public Dispose() {
        this.__list = [];

    }
    public Add(item: T): number {
        this._map.add(item);
        var i = this.__list.push(item) - 1;
        if (this.ItemAdded != undefined) { this.ItemAdded(item); };
        return i;
    }

    public AddBefore(item: T) {
        this._map.add(item);
        var i = this.__list.unshift(item) - 1;
        if (this.ItemAddedBefore != undefined) { this.ItemAddedBefore(item); };
        return i;

    }

    public Insert(start:any, item: T) {
        this._map.add(item);
        var i = this.__list.splice(start, 0, item);
        if (this.ItemSplice != undefined) { this.ItemSplice(start, item); };
        return i;
    }

    public get items(): Array<T> {
        return this.__list;
    }

    public clear(): T[] {
        this._map.clear();
        this.__list.splice(0);
        this.__list = [];
        return this.__list;
    };
    public get count(): number { 
        return this.__list.length;
    };

    public remove(item: T): T[] {
        this._map.delete(item);
        this.__list.splice(this.__list.indexOf(item), 1);
        (item as any) = null
        return [];
    };

    public indexOf(item: T): number {
        return this.__list.indexOf(item)
    }

    public FindFromKey(key: any, value: any): T[] {
        return this.__list.filter(i => { return (i as any)[key] === value })
    }

    public removeIndex(index: number): T[] {
        var deleted = this.__list.splice(index, 1);
        deleted.forEach(t => {
            this._map.delete(t);
        })
        return deleted;
    };

    public has(item: T): boolean {
        return this._map.has(item);
    }

    public item(index: number): T {
        return this.__list[index];
    }

    public forEach(callbackfn: (value: T, index: number, array: T[]) => void) {

        this.__list?.forEach(callbackfn);
    }

    public ReverseClone(): Array<T> {
        return this.__list.reverse();
    }

    public filter(callbackfn: (value: T, index: number, array: T[]) => boolean ): Array<T> {
        return this.__list.filter(callbackfn);
    }
};