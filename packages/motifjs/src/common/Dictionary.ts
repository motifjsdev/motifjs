import { List, NameValuePair } from "./";

export class Dictionary<KType, VType> {
    private __values: List<NameValuePair<KType, VType>> = new List<NameValuePair<KType, VType>>();
    public Add(Key: KType, Value: VType): number {


        var item = new NameValuePair<KType, VType>();
        item.Key = Key;
        item.value = Value;
        var n = this.__values.Add(item);
        if (this.OnItemAdded != null) {
            this.OnItemAdded(item.Key, item.value);
        }

        return n;

    }
    public has(key: KType) {
        return this.filter(t => t.Key == key)[0] ? true : false;
    }
    public item(key: KType) {
        return this.filter(t => t.Key == key)[0]
    }
    public OnItemAdded!: (key: KType, value: VType) => any;
    public removeIndex(index: number): NameValuePair<KType, VType>[] {
        var i = this.__values.removeIndex(index - 1);
        return i;
    };
    public remove(Key: KType) {
        var item = this.__values.filter(x => x.Key == Key);
        item.forEach((v) => {
            this.__values.remove(v);
        });
    };
    public clear() {
        this.__values.clear();
    };
    public forEach(callback: ((item: NameValuePair<KType, VType>) => void)) {
        this.__values.forEach(callback);

    }
    public get values(): List<NameValuePair<KType, VType>> {
        return this.__values;
    }
    public filter(callbackfn: (value: NameValuePair<KType, VType>, index: number, array: NameValuePair<KType, VType>[]) => boolean): NameValuePair<KType, VType>[] {
        return this.__values.items.filter(callbackfn);
    }

    public find(predicate: (value: NameValuePair<KType, VType>, index: number, obj: NameValuePair<KType, VType>[]) => unknown, thisArg?: any): NameValuePair<KType, VType> | undefined {
        return this.__values.items.find(predicate);
    }
} 