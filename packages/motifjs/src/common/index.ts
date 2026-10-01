
export * from "./NameValuePair";
export * from "./List";
export * from "./functions";
export * from "./ErrorHandler";
export * from "./LeakMonitor";
export * from "./Dictionary";
export * from "./IAttribute";
export * from "./LinkedList";
export type { TransitionProps, CSSTransitionInfo, TransitionPhase } from "./transition";
export * from "./bind";
export * from "./Query";
export { MotifError } from "./diagnostics";
export { motifCompiled } from "./compilerContract";
export type { MotifErrorCode } from "./diagnostics";


export enum NodeTypes {
    ELEMENT_NODE = 1,
    ATTRIBUTE_NODE = 2,
    TEXT_NODE = 3,
    CDATA_SECTION_NODE = 4,
    ENTITY_REFERENCE_NODE = 5,
    /**deprecated */
    ENTITY_NODE = 6,
    /**deprecated */
    PROCESSING_INSTRUCTION_NODE = 7,
    COMMENT_NODE = 8,
    DOCUMENT_NODE = 9,
    DOCUMENT_TYPE_NODE = 10,
    DOCUMENT_FRAGMENT_NODE = 11,
    /**deprecated */
    NOTATION_NODE = 12
}
