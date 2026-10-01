
export interface BindingFormatInfo {
    locale?: string | string[];
    currency?: string;
}

export interface IBaseBinding {
    propertyName: string;
    dataSource: any;
    dataMember?: string;
    formatString?: string;
    converter?: (value: any) => any;
    converterBack?: (value: any) => any;
    setter?: (value: any) => void;
    formatInfo?: BindingFormatInfo;
    updateMode?: 'onPropertyChanged' | 'onValidation' | 'never';
    activate(): void;
    deactivate(): void;
    reActivate(): void;
}