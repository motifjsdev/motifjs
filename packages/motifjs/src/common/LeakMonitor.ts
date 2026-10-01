import { reportWarning } from "./diagnostics";

export class LeakMonitor {

    private readonly _origins = new Map<string, number>();
    private _quietChecks = 0;

    constructor(readonly threshold: number, readonly name: string) { }

    check(size: number): (() => void) | undefined {
        if (this.threshold <= 0 || size < this.threshold) {
            return undefined;
        }
        const origin = new Error().stack ?? '';
        this._origins.set(origin, (this._origins.get(origin) ?? 0) + 1);

        this._quietChecks--;
        if (this._quietChecks <= 0) {
            this._quietChecks = this.threshold / 2;
            const [stack, count] = this._busiestOrigin();
            reportWarning('MJX507', [this.name, size, count], stack);
        }

        return () => {
            this._origins.set(origin, (this._origins.get(origin) ?? 0) - 1);
        };
    }

    private _busiestOrigin(): [string, number] {
        let busiest: [string, number] = ['', 0];
        for (const entry of this._origins) {
            if (entry[1] > busiest[1]) {
                busiest = entry;
            }
        }
        return busiest;
    }
}
