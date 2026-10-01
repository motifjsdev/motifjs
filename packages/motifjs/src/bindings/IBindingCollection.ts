import { ComponentBase } from "../";
import { BindingFormatInfo, IBaseBinding, ListBindingOptions } from "./";

export interface IBindingCollection {
    add(propertyName: string, dataSource: any): IBaseBinding;
    add(propertyName: string, dataSource: any, dataMember: string): IBaseBinding;
    add(propertyName: string, dataSource: any, dataMember: string, formatString: string): IBaseBinding;
    add(propertyName: string, dataSource: any, dataMember: string, formatString: string, formatInfo: BindingFormatInfo): IBaseBinding;
    add(binding: IBaseBinding): IBaseBinding;
    wait(predicate: () => any): IBaseBinding;
    when(conditionFn: () => any, effectFn: (isTrue: boolean) => any): IBaseBinding;
    ternary(conditionFn: () => any, trueFn: (frame: any) => any, falseFn: (frame: any) => any): IBaseBinding;
    list(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase): IBaseBinding;
    list(itemsFn: () => any[] | Iterable<any>, renderFn: (item: any, index: number) => ComponentBase, options: ListBindingOptions): IBaseBinding;
    remove(binding: IBaseBinding): void;
    clear(): void;
    items: IBaseBinding[];

    switchCase(
        discriminatorFn: () => any,
        cases: Record<string | number, (frame: any) => any>,
        defaultFn?: (frame: any) => any
    ): any;
}