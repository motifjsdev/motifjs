const preprocessitem = new Set<Function>();

export function preProcessing(callback: () => any) {
    preprocessitem.add(callback);
    renderPreProcessing();
}

export function renderPreProcessing() {
    preprocessitem.forEach(i => {
        i();
    })
}