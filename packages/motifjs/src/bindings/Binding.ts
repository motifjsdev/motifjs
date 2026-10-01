
import { ComponentBase } from "../";
import { effect } from "../store/reactivity-core";
import { BindingFormatInfo, IBaseBinding } from "./";


export function isCheckedInput(el: any): boolean {
    if (!el || el.tagName !== 'INPUT') return false;
    const t = String(el.type || '').toLowerCase();
    return t === 'checkbox' || t === 'radio';
}

export function isNumericInput(el: any): boolean {
    if (!el || el.tagName !== 'INPUT') return false;
    const t = String(el.type || '').toLowerCase();
    return t === 'number' || t === 'range';
}

export function readModelValue(el: any): any {
    if (!el) return undefined;
    if (isCheckedInput(el)) return !!el.checked;
    if (isNumericInput(el)) {
        const raw = el.value;
        if (raw === '' || raw == null) return null;
        const n = typeof el.valueAsNumber === 'number' ? el.valueAsNumber : Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return el.value;
}

export class Binding implements IBaseBinding {
    propertyName: string;
    dataSource: any;
    dataMember?: string;
    formatString?: string;
    converter?: (value: any) => any;
    converterBack?: (value: any) => any;
    setter?: (value: any) => void;
    formatInfo?: BindingFormatInfo;
    updateMode: 'onPropertyChanged' | 'onValidation' | 'never' = 'onPropertyChanged';

    private _isActive: boolean = false;
    private _component: ComponentBase;
    private _effectCleanup?: () => void;
    private _memberPath: string[] | null = null;
    private _memberPathSource?: string;

    constructor(
        component: ComponentBase,
        propertyName: string,
        dataSource: any,
        dataMember?: string,
        formatString?: string,
        formatInfo?: BindingFormatInfo
    ) {
        this._component = component;
        this.propertyName = propertyName;
        this.dataSource = dataSource;
        this.dataMember = dataMember;
        this.formatString = formatString;
        this.formatInfo = formatInfo;
        this._memberPath = dataMember ? dataMember.split('.') : null;
        this._memberPathSource = dataMember;
    }

    activate(): void {
        if (this._isActive) return;

        this._isActive = true;
        this._setupBinding();
    }

    deactivate(): void {

        if (!this._isActive) return;

        this._isActive = false;
        if (this._effectCleanup) {
            this._effectCleanup();
            this._effectCleanup = undefined;
        }
    }

    reActivate(): void {

        if (this._effectCleanup) {
            this._effectCleanup();
            this._effectCleanup = undefined;
        }
        this._setupBinding();
    }

    private functional(value: any) {
        if (typeof value === 'function') {
            value = this.functional(value());
        }
        return value;
    }
    private _setupBinding(): void {
        const getValue = () => {

            let value: any = this.dataSource;
            if (this.dataMember) {
                if (this._memberPathSource !== this.dataMember) {
                    this._memberPath = this.dataMember.split('.');
                    this._memberPathSource = this.dataMember;
                }
                for (const prop of this._memberPath!) {
                    if (value != null) {
                        value = value[prop];
                    }
                }
            }
            value = this.functional(value);
            if (this.formatString && value != null) {
                value = this._applyFormat(value, this.formatString);
            }

            if (this.converter) {
                value = this.converter(value);
            }

            return value;
        };

        const updateTarget = () => {
            const value = getValue();
            this._updateComponentProperty(value);
            return value;
        };

        this._effectCleanup = effect(() => {
            return updateTarget();
        });

    }

    private _updateComponentProperty(value: any): void {

        switch (this.propertyName.toLowerCase()) {
            case 'wait': {
                const comp = this._component;
                if (!comp || comp.isDisposed) return;
                const isWaiting = !!value;
                if (!comp.isBuilt) {
                    comp.isWait = isWaiting;
                } else {
                    if (isWaiting) {
                        comp.isWait = true;
                    } else {
                        comp.isWait = false;
                    }
                }
                break;
            }
            case 'display': {
                const comp = this._component;
                if (!comp || comp.isDisposed) return;
                const isWaiting = value;
                if (!comp.isBuilt) {
                    comp.isWait = !isWaiting;
                } else {
                    if (isWaiting) {
                        comp.isWait = false;
                    } else {
                        comp.isWait = true;
                    }
                }
                break;
            }
            case 'text':
            case 'textcontent':
                this._component.setText(value);
                break;
            case 'innerhtml':
            case 'html':
                this._component.element.innerHTML = (value);
                this._component.motif.trigger('htmlChanged', { value: value });
                break;
            case 'visible':
            case 'visibility':
                if (value) {
                    this._component.motif.show();
                } else {
                    this._component.motif.hide();
                }
                break;
            case 'style':
                if (typeof value === 'object') {
                    this._component.style(value);
                }
                break;
            case 'model': {

                const el: any = this._component.element;
                if (!el) break;
                if (isCheckedInput(el)) {
                    el.checked = !!value;
                } else {
                    el.value = value == null ? '' : value;
                }
                break;
            }
            case 'when':

                break;
            default:
                if (this._component.element && this.propertyName in this._component.element) {
                    (this._component.element as any)[this.propertyName] = value;
                } else if (this.propertyName in this._component) {
                    (this._component as any)[this.propertyName] = value;
                }
                break;
        }
    }

    private _applyFormat(value: any, format: string): string {
        const locale = this.formatInfo?.locale;
        const currency = this.formatInfo?.currency;
        if (typeof value === 'number') {
            if (format.includes('C') || format.includes('c')) {
                if (currency) {
                    return new Intl.NumberFormat(locale, {
                        style: 'currency',
                        currency
                    }).format(value);
                }
                return new Intl.NumberFormat(locale, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(value);
            }
            if (format.includes('P') || format.includes('p')) {
                return new Intl.NumberFormat(locale, {
                    style: 'percent'
                }).format(value);
            }
            if (format.includes('N') || format.includes('n')) {
                const decimals = parseInt(format.match(/\d+/)?.[0] || '2');
                return new Intl.NumberFormat(locale, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                }).format(value);
            }
        }

        if (value instanceof Date) {
            if (format.includes('d')) {
                return value.toLocaleDateString(locale);
            }
            if (format.includes('t')) {
                return value.toLocaleTimeString(locale);
            }
        }

        return value?.toString() || '';
    }
}