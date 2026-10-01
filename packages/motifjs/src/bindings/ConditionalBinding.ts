
import { ComponentBase, ConditionalWrapper, motifFragment } from "../";
import { IBaseBinding } from "./";


export class ConditionalBinding implements IBaseBinding {
    private computeFn: () => any;
    private renderFn: (result: any) => any;
    private _isActive: boolean = false;
    private _wrapper?: ConditionalWrapper;
    reActivate(): void {
        this.deactivate();
        this.activate();
    }
    constructor(private component: ComponentBase, computeFn: () => any, renderFn: (result: any) => any) {
        this.computeFn = computeFn;
        this.renderFn = renderFn;
    }
    propertyName: string = "__conditional__";
    dataSource: any;
    dataMember?: string | undefined;
    formatString?: string | undefined;
    converter?: ((value: any) => any) | undefined;
    converterBack?: ((value: any) => any) | undefined;
    updateMode?: "onPropertyChanged" | "onValidation" | "never" | undefined;

    activate(): void {
        if (this._isActive) return;
        this._isActive = true; 
        this._wrapper = new ConditionalWrapper(() => {
            var smooth = this.computeFn();
            let result: any;
            try {
                result = this.renderFn(smooth);
            } catch {
                result = null;
            } 
            if (Array.isArray(result)) {
                const frag = motifFragment();
                try { frag.controls.add(...(result as any)); } catch { }
                return frag;
            }
            return result;
        }); 
        this.component.controls.add(this._wrapper as any);
    }
    deactivate(): void {
        if (!this._isActive) return;
        this._isActive = false; 
        try {
            if (this._wrapper) {
                this._wrapper.dispose();
            }
        } catch { }
        this._wrapper = undefined;
    }
}