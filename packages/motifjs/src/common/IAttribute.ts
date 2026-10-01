
export interface IAttribute<BaseType> {

    add(attribute: object | string): BaseType;
    remove(key: string): BaseType;
    has(key: string): boolean;
    get(key: string): string | null;
}


export interface IClass<BaseType> {
    add(...values: (string | any[] | {} | Function)[]): BaseType;
    remove(classNames: string[] | string): BaseType;
    has(className: string): boolean;
}