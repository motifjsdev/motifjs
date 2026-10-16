import Compiler from '../src/compiler';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

describe('üretilen sender/frame parametreleriyle çakışan kullanıcı adları', () => {
    test('view() içindeki const sender JSX\'ten okununca yeniden adlandırılır', () => {
        const out = compile(`
            class Repro extends Component<HTMLDivElement> {
                view() {
                    const sender = "Ayşe";
                    return <><span>{sender}</span></>;
                }
            }
        `);
        expect(out).toMatch(/const _sender = "Ayşe"/);
        expect(out).toMatch(/__childExpr:\s*\(\)\s*=>\s*_sender\b/);
        expect(out).not.toMatch(/__childExpr:\s*\(\)\s*=>\s*sender\b/);
    });

    test('ternary dalındaki const frame yeniden adlandırılır', () => {
        const out = compile(`
            class Repro extends Component<HTMLDivElement> {
                view() {
                    const frame = "çerçeve";
                    const show = true;
                    return <>{show ? <b>{frame}</b> : null}</>;
                }
            }
        `);
        expect(out).toMatch(/const _frame = "çerçeve"/);
        expect(out).toMatch(/__childExpr:\s*\(\)\s*=>\s*_frame\b/);
    });

    test('olay işleyicisi parametresi ve getter içindeki başvuru da yeniden adlandırılır', () => {
        const out = compile(`
            function Row() {
                const sender = "Ayşe";
                return <p onclick={() => console.log(sender)}>{() => sender}</p>;
            }
        `);
        expect(out).toMatch(/console\.log\(_sender\)/);
        expect(out).toMatch(/bindings\.method\(\(\)\s*=>\s*_sender\)/);
    });

    test('JSX içinde tanımlanıp iç içe bir etiketten okunan .map parametresi yeniden adlandırılır', () => {
        const out = compile(`
            function List(props) {
                return <ul>{props.items.map((sender) => <li key={sender.id}>{sender.name}</li>)}</ul>;
            }
        `);
        expect(out).toMatch(/_sender\.name/);
        expect(out).not.toMatch(/\bsender\.name/);
    });

    test('modül düzeyindeki export const sender dışa aktarım adını korur', () => {
        const out = compile(`
            export const sender = "Ayşe";
            export function Who() { return <span>{sender}</span>; }
        `);
        expect(out).toMatch(/const _sender = "Ayşe"/);
        expect(out).toMatch(/export\s*\{\s*_sender as sender\s*\}/);
        expect(out).toMatch(/__childExpr:\s*\(\)\s*=>\s*_sender\b/);
    });

    test('JSX etiketinde tanımlanan (sender, e) işleyicisi olduğu gibi kalır', () => {
        const out = compile(`
            function Field() {
                return <input oninput={(sender, e) => sender.element.focus()} />;
            }
        `);
        expect(out).toMatch(/\(sender, e\)\s*=>\s*sender\.element\.focus\(\)/);
        expect(out).not.toMatch(/_sender/);
    });

    test('JSX\'ten okunmayan sender adı dokunulmadan kalır', () => {
        const out = compile(`
            function tag() { const sender = "a"; return sender.toUpperCase(); }
            function View() { return <span>{tag()}</span>; }
        `);
        expect(out).toMatch(/const sender = "a"/);
        expect(out).not.toMatch(/_sender/);
    });
});
