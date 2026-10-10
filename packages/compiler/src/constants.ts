import * as BabelCore from '@babel/core';
export const motifComponent = () => { return "_mc" }
export const motifFragment = () => { return "_mf" }
export const motifFunctionComponent = () => { return "_mfc" }
export const motifCompiled = () => { return "_mv" }
export const COMPILER_CONTRACT = 1;

export type State = {
    get: (name: string) => any;
    set: (name: string, value: any) => any; 
    file: BabelCore.BabelFile
};