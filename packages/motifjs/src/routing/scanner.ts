export const enum CharacterCodes {
    slash = 0x2F,                 // /
    question = 0x3F,              // ?
    colon = 0x3A,                 // :
    openBrace = 0x7B,             // {
    closeBrace = 0x7D,            // }
    equals = 0x3D,                // =
    $ = 0x24,
    backslash = 0x5C,             // \
}




export interface IToken {
    type: 'static' | 'optional' | 'parameter';
    regexs: [];
    input: string;
    default: string | undefined;
    parameterName: string;
    isOptinal: boolean;
    parameterIndex: number;
    sectionIndex: number;
    hasLeadingSlash?: boolean;
    leadingSlashTokenIndex?: number;
    hasLeadingStatic?: boolean;
    leadingStaticTokenIndex?: number;
    consumed?: boolean;
}
export class Scanner {

    constructor(public source: string) {
        this.tokens = [];
    }
    currentColumn = 0;
    tokens: IToken[] = [];
    addToken(token: IToken) {
        this.tokens.push(token);
    }

    public parse(): RegExp {
        if (!this.source.startsWith("/")) {
            this.source = "/" + this.source;
        }
        // Sondaki '/' karakterlerini normalize et (kök '/' hariç): '/app/' deseni '/app' ile aynı
        while (this.source.length > 1 && this.source.endsWith('/')) {
            this.source = this.source.slice(0, -1);
        }

        var currentType: 'static' | 'optional' | 'parameter' | 'defaultValue' = 'static';
        var parentTokenIndex = -1;
        var parameterIndex = 0;
        var sectionIndex = -1;
        this.tokens = [];
        this.currentColumn = 0;
        while (this.currentColumn < this.source.length) {

            var cpa = this.codePointAt(this.source, this.currentColumn);

            var currentToken = this.tokens[parentTokenIndex];
            switch (cpa) {
                case CharacterCodes.slash:
                    sectionIndex++;
                    if (currentToken === undefined || currentToken.input.length > 1) {
                        this.tokens.push({ default: '', input: '/', isOptinal: false, regexs: [], type: 'static', parameterName: '', parameterIndex: parameterIndex, sectionIndex });
                        parentTokenIndex = this.tokens.length - 1;
                    }
                    break;
                case CharacterCodes.openBrace:
                    parameterIndex++;
                    let hasLeadingSlash = false;
                    let leadingSlashTokenIndex: number | undefined = undefined;
                    let hasLeadingStatic = false;
                    let leadingStaticTokenIndex: number | undefined = undefined;
                    if (this.tokens.length > 0) {
                        const prev = this.tokens[this.tokens.length - 1];
                        if (prev && prev.type === 'static' && prev.input === '/' && !prev.consumed) {
                            hasLeadingSlash = true;
                            leadingSlashTokenIndex = this.tokens.length - 1;
                        } else if (prev && prev.type === 'static' && prev.input !== '/' && prev.sectionIndex === sectionIndex && !prev.consumed) {
                            hasLeadingStatic = true;
                            leadingStaticTokenIndex = this.tokens.length - 1;
                        }
                    }
                    this.tokens.push({ default: undefined, input: '', isOptinal: false, regexs: [], type: 'parameter', parameterName: '', parameterIndex: parameterIndex, sectionIndex, hasLeadingSlash, leadingSlashTokenIndex, hasLeadingStatic, leadingStaticTokenIndex });
                    parentTokenIndex = this.tokens.length - 1;
                    currentType = 'parameter';
                    break;
                case CharacterCodes.closeBrace:
                    currentType = 'static';
                    parentTokenIndex = -1;
                    break;
                case CharacterCodes.colon:
                    currentType = 'defaultValue';
                    break;

                case CharacterCodes.question:
                    if (currentToken) {
                        currentToken.isOptinal = true;
                    }
                    break;
                default:
                    const ch = this.source[this.currentColumn];
                    if (currentToken) {
                        if (currentType === 'parameter') {
                            currentToken.parameterName = `${currentToken.parameterName + ch}`;
                        } else if (currentType === 'defaultValue') {
                            currentToken.default = `${(currentToken.default ?? '') + ch}`;
                        } else {
                            if (currentToken.type === 'static') {
                                currentToken.input = `${currentToken.input + ch}`;
                            } else {
                                this.tokens.push({ default: undefined, input: ch, isOptinal: false, regexs: [], type: 'static', parameterName: '', parameterIndex: parameterIndex, sectionIndex });
                                parentTokenIndex = this.tokens.length - 1;
                            }
                        }
                    } else {
                        this.tokens.push({ default: undefined, input: ch, isOptinal: false, regexs: [], type: 'static', parameterName: '', parameterIndex: parameterIndex, sectionIndex });
                        parentTokenIndex = this.tokens.length - 1;
                    }
                    break;
            }
            this.currentColumn++;
        }

        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const charClass = "[\\w\\d\\_\\-\\%\\&\\$\\+\\#\\,\\.\\{\\}\\(\\)\\[\\]\\?\\:\\=\\;\\'\\\"\\~\\\\]";

        for (const t of this.tokens) {
            if (t.type === 'parameter' && t.isOptinal && t.hasLeadingSlash && typeof t.leadingSlashTokenIndex === 'number') {
                const prev = this.tokens[t.leadingSlashTokenIndex];
                if (prev && prev.type === 'static' && prev.input === '/') {
                    prev.consumed = true;
                }
            }
            if (t.type === 'parameter' && t.isOptinal && t.hasLeadingStatic && typeof t.leadingStaticTokenIndex === 'number') {
                const prev = this.tokens[t.leadingStaticTokenIndex];
                if (prev && prev.type === 'static' && prev.input && prev.sectionIndex === t.sectionIndex) {
                    prev.consumed = true;
                }
            }
        }

        const escapeClassChar = (c: string) => c.replace(/[\\\]\^\-]/g, '\\$&');

        const getNextDelimChar = (idx: number): string | undefined => {
            const t = this.tokens[idx];
            for (let j = idx + 1; j < this.tokens.length; j++) {
                const nx = this.tokens[j];
                if (nx.type === 'static' && nx.sectionIndex === t.sectionIndex) {
                    if (nx.input && nx.input !== '/') {
                        return nx.input[0];
                    }
                }
                if (nx.type === 'static' && nx.input === '/') break;
            }
            return undefined;
        };
        const buildCapture = (idx: number, isOptional: boolean) => {
            const delim = getNextDelimChar(idx);
            const innerClass = delim ? `[^${escapeClassChar(escapeRegex(delim))}]` : charClass;
            const quant = isOptional ? '{0,255}' : '{1,255}';
            return `(${innerClass}${quant})`;
        };

        let pattern = '^';
        for (let i = 0; i < this.tokens.length;) {
            const tok = this.tokens[i];
            if (tok.type === 'static' && tok.input === '/') {
                if (!tok.consumed) pattern += '/';
                i++;
                continue;
            }
            const segStart = i;
            let segEnd = i;
            while (segEnd < this.tokens.length) {
                const t = this.tokens[segEnd];
                if (t.type === 'static' && t.input === '/' && segEnd !== segStart) break;
                if (t.type === 'static' && t.input === '/' && segEnd === segStart) { segEnd++; break; }
                segEnd++;
            }
            const visited: Record<number, boolean> = {};
            let k = segStart;
            while (k < segEnd) {
                if (visited[k]) { k++; continue; }
                const t = this.tokens[k];
                if (t.type === 'static') {
                    if (!t.consumed) pattern += escapeRegex(t.input);
                    visited[k] = true;
                    k++;
                    continue;
                }
                if (t.isOptinal && !t.hasLeadingStatic) {

                    const firstIdx = k;
                    let hasDependent = false;
                    for (let jj = firstIdx + 1; jj < segEnd; jj++) {
                        const sj = this.tokens[jj];
                        const pj = this.tokens[jj + 1] as IToken | undefined;
                        if (sj && sj.type === 'static' && pj && pj.type === 'parameter' && pj.isOptinal && pj.hasLeadingStatic && typeof pj.leadingStaticTokenIndex === 'number' && pj.leadingStaticTokenIndex === jj) {
                            hasDependent = true;
                            break;
                        }
                        if (sj && sj.type === 'static' && sj.input === '/') break;
                    }

                    let groupInner = '';
                    if (t.hasLeadingSlash) groupInner += '/';
                    groupInner += buildCapture(firstIdx, !hasDependent);
                    visited[firstIdx] = true;
                    let j = firstIdx + 1;
                    while (j < segEnd) {
                        const sj = this.tokens[j];
                        if (sj.type === 'static' && this.tokens[j + 1] && this.tokens[j + 1].type === 'parameter') {
                            const prm = this.tokens[j + 1] as IToken;
                            if (prm.isOptinal && prm.hasLeadingStatic && typeof prm.leadingStaticTokenIndex === 'number' && prm.leadingStaticTokenIndex === j) {
                                const lit = escapeRegex(sj.input);
                                const cap = buildCapture(j + 1, true);
                                groupInner += `(?:${lit}${cap})?`;
                                visited[j] = true;
                                visited[j + 1] = true;
                                j += 2;
                                continue;
                            }
                        }
                        break;
                    }
                    pattern += `(?:${groupInner})?`;
                    k = j;
                    continue;
                } else {
                    const cap = buildCapture(k, t.isOptinal);
                    if (t.isOptinal) {
                        if (t.hasLeadingSlash) {
                            pattern += `(?:/${cap})?`;
                        } else if (t.hasLeadingStatic && typeof t.leadingStaticTokenIndex === 'number') {
                            const prev = this.tokens[t.leadingStaticTokenIndex];
                            const lit = prev && prev.type === 'static' ? escapeRegex(prev.input) : '';
                            pattern += `(?:${lit}${cap})?`;
                        } else {
                            pattern += `(?:${cap})?`;
                        }
                    } else {
                        pattern += cap;
                    }
                    visited[k] = true;
                    k++;
                }
            }
            i = segEnd;
        }

        pattern += '$';
        return new RegExp(pattern, "i");
    }
    public parameters: Record<string, any> = {};
    public exist(input: string, pageSearch?: string): boolean {
        const hashIdx = input.indexOf('#');
        const withoutHash = hashIdx >= 0 ? input.substring(0, hashIdx) : input;
        let path = withoutHash;
        let query = '';
        const qIdx = withoutHash.indexOf('?');
        if (qIdx >= 0) {
            path = withoutHash.substring(0, qIdx);
            query = withoutHash.substring(qIdx + 1);
        }

        // İstek yolundaki sondaki '/' karakterlerini yok say (kök '/' hariç):
        // '/app/' → '/app'; desen ^...$ tam eşleşme olduğundan aksi halde not-found olur.
        while (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        var tx = this.parse();
        var rx = tx.exec(path);

        if (rx) {
            var i = rx ? rx.length : 0;
            var arr = <any>[];

            this.parameters = {};
            rx?.forEach((t, indx) => {
                arr.push(t);
            })
            if (query && query.length) {
                const urlSearchParams = new URLSearchParams(query);
                const queryMap = new Map<string, string[]>();
                urlSearchParams.forEach((val, key) => {
                    const existing = queryMap.get(key) || [];
                    existing.push(val);
                    queryMap.set(key, existing);
                });
                queryMap.forEach((values, key) => {
                    if (values.length === 1) {
                        this.parameters[key] = values[0];
                    } else {
                        this.parameters[key] = values;
                    }
                });
            } else if (pageSearch) {
                const urlSearchParams = new URLSearchParams(pageSearch);
                const queryMap = new Map<string, string[]>();
                urlSearchParams.forEach((val, key) => {
                    const existing = queryMap.get(key) || [];
                    existing.push(val);
                    queryMap.set(key, existing);
                });
                queryMap.forEach((values, key) => {
                    if (values.length === 1) {
                        this.parameters[key] = values[0];
                    } else {
                        this.parameters[key] = values;
                    }
                });
            }

            if (rx.input === arr[0]) {
                rx?.forEach((t, indx) => {

                    if (indx !== 0) {
                        var all = this.tokens.find(t => t.parameterIndex == indx);
                        if (all) {
                            let val: any = t;
                            if ((val === undefined || val === '') && all.isOptinal) {
                                const def = (all.default === undefined || all.default === '') ? undefined : all.default;
                                val = def;
                            }
                            if (val === undefined) {
                                this.parameters[all.parameterName] = undefined;
                            } else {
                                this.parameters[all.parameterName] = val;
                            }
                        }
                    }
                })
                /* TODO: route detayları ile ilgili mesajı Geliştirici Araçları'na gönder */
                return true;
            }
        }

        return false;
    }
    codePointAt: (s: string, i: number) =>
        number = (String.prototype as any).codePointAt ?
            (s, i) => (s as any).codePointAt(i) : function codePointAt(str, i): number {
                const size = str.length;
                if (i < 0 || i >= size) {
                    return undefined!;
                }
                const first = str.charCodeAt(i);
                if (first >= 0xD800 && first <= 0xDBFF && size > i + 1) {
                    const second = str.charCodeAt(i + 1);
                    if (second >= 0xDC00 && second <= 0xDFFF) {
                        return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
                    }
                }
                return first;
            };

}