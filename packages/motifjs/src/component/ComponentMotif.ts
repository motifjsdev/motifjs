import type { ComponentBase } from "./componentBase";
import { disposableCore, IDisposable } from "..";
import type { ComponentBaseOptions, EventArgs, HtmlElementEvents } from "./types";

export class ComponentMotif<TSelf extends ComponentBase = ComponentBase, TProps extends object = any> {

        private readonly _component: TSelf;
        public options: ComponentBaseOptions<TProps> & { hideStrategy?: 'placeholder' | 'detach' | 'auto', __fromList?: boolean, __key?: any, placeholder?: Comment };

        constructor(component: TSelf, options: ComponentMotif<TSelf, TProps>['options']) {
                this._component = component;
                this.options = options;
        }

        public show(): Promise<any> {
                return this._component['_show']();
        }

        public hide(): Promise<any> {
                return this._component['_hide']();
        }

        public toggle(): void {
                this._component['_toggle']();
        }

        public on<K extends keyof HtmlElementEvents>(event: K, cb: (sender: TSelf, ev: HtmlElementEvents[K]) => any, domEvent: boolean = true): Promise<TSelf> {
                return this._component['_on'](event, cb as any, domEvent);
        }

        public off<K extends keyof HtmlElementEvents>(event: K, cb: (sender: TSelf, ev: HtmlElementEvents[K]) => any): Promise<TSelf> {
                return this._component['_off'](event, cb as any);
        }

        public trigger(event: any, ev: any): Promise<TSelf> {
                return this._component['_trigger'](event, ev);
        }

        public addHandler(event: any, handler: (sender: ComponentBase, e: EventArgs) => void): void {
                this._component['_addHandler'](event, handler);
        }

        public clear(): Promise<any> {
                return this._component['_clear']();
        }

        public register(c: IDisposable): void {
                this._component['_register'](c);
        }

        public setDisposable(c: () => void): void {
                this._component['_register'](disposableCore.toDisposable(c));
        }

        public stopAnimations(): Promise<void> {
                return this._component['_stopAnimations']();
        }
}
