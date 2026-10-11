export function pushTight<T>(list: T[], value: T): void {
    if (list.length === 0) {
        list.length = 1;
        list[0] = value;
        return;
    }
    list.push(value);
}
