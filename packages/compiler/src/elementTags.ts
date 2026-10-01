
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const HTML_TAGS: Record<string, string> = {
    HTMLAnchorElement: 'a',
    HTMLAreaElement: 'area',
    HTMLAudioElement: 'audio',
    HTMLBRElement: 'br',
    HTMLBaseElement: 'base',
    HTMLBodyElement: 'body',
    HTMLButtonElement: 'button',
    HTMLCanvasElement: 'canvas',
    HTMLDListElement: 'dl',
    HTMLDataElement: 'data',
    HTMLDataListElement: 'datalist',
    HTMLDetailsElement: 'details',
    HTMLDialogElement: 'dialog',
    HTMLDivElement: 'div',
    HTMLEmbedElement: 'embed',
    HTMLFieldSetElement: 'fieldset',
    HTMLFormElement: 'form',
    HTMLHRElement: 'hr',
    HTMLHeadElement: 'head',
    HTMLHeadingElement: 'h1',
    HTMLHtmlElement: 'html',
    HTMLIFrameElement: 'iframe',
    HTMLImageElement: 'img',
    HTMLInputElement: 'input',
    HTMLLIElement: 'li',
    HTMLLabelElement: 'label',
    HTMLLegendElement: 'legend',
    HTMLLinkElement: 'link',
    HTMLMapElement: 'map',
    HTMLMenuElement: 'menu',
    HTMLMetaElement: 'meta',
    HTMLMeterElement: 'meter',
    HTMLModElement: 'ins',
    HTMLOListElement: 'ol',
    HTMLObjectElement: 'object',
    HTMLOptGroupElement: 'optgroup',
    HTMLOptionElement: 'option',
    HTMLOutputElement: 'output',
    HTMLParagraphElement: 'p',
    HTMLPictureElement: 'picture',
    HTMLPreElement: 'pre',
    HTMLProgressElement: 'progress',
    HTMLQuoteElement: 'blockquote',
    HTMLScriptElement: 'script',
    HTMLSelectElement: 'select',
    HTMLSlotElement: 'slot',
    HTMLSourceElement: 'source',
    HTMLSpanElement: 'span',
    HTMLStyleElement: 'style',
    HTMLTableCaptionElement: 'caption',
    HTMLTableCellElement: 'td',
    HTMLTableColElement: 'col',
    HTMLTableElement: 'table',
    HTMLTableRowElement: 'tr',
    HTMLTableSectionElement: 'tbody',
    HTMLTemplateElement: 'template',
    HTMLTextAreaElement: 'textarea',
    HTMLTimeElement: 'time',
    HTMLTitleElement: 'title',
    HTMLTrackElement: 'track',
    HTMLUListElement: 'ul',
    HTMLVideoElement: 'video',
    HTMLElement: 'div',
};

const SVG_TAGS: Record<string, string> = {
    SVGSVGElement: 'svg',
    SVGGElement: 'g',
    SVGPathElement: 'path',
    SVGCircleElement: 'circle',
    SVGRectElement: 'rect',
    SVGLineElement: 'line',
    SVGTextElement: 'text',
    SVGTSpanElement: 'tspan',
    SVGPolygonElement: 'polygon',
    SVGPolylineElement: 'polyline',
    SVGEllipseElement: 'ellipse',
    SVGUseElement: 'use',
    SVGDefsElement: 'defs',
    SVGImageElement: 'image',
    SVGMaskElement: 'mask',
    SVGSymbolElement: 'symbol',
    SVGMarkerElement: 'marker',
    SVGForeignObjectElement: 'foreignObject',
    SVGLinearGradientElement: 'linearGradient',
    SVGRadialGradientElement: 'radialGradient',
    SVGStopElement: 'stop',
    SVGClipPathElement: 'clipPath',
};

export interface ResolvedElementType {
    tag: string;
    namespace?: string;
}

export function resolveElementType(typeName: string): ResolvedElementType | undefined {
    if (!typeName) return undefined;
    const html = HTML_TAGS[typeName];
    if (html) return { tag: html };
    const svg = SVG_TAGS[typeName];
    if (svg) return { tag: svg, namespace: SVG_NAMESPACE };
    return undefined;
}