import { IDisposable } from "../disposable/IDisposable";

export interface IAttribute<BaseType> {

    add(attribute: object | string): BaseType;
    remove(key: string): BaseType;
    has(key: string): boolean;
    get(key: string): string | null;
    hold(attribute: object): IDisposable;
}


export interface IClass<BaseType> {
    add(...values: (string | any[] | {} | Function)[]): BaseType;
    remove(classNames: string[] | string): BaseType;
    has(className: string): boolean;
}