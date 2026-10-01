function rethrowLater(error: any): void {
	setTimeout(() => { throw error; }, 0);
}

export class ErrorHandler {
	private unexpectedErrorHandler: (e: any) => void = rethrowLater;
	private listeners: Array<(error: any) => void> = [];
	private _isDevelopment: boolean = false;
	private _enableConsoleLogging: boolean = true;

	public setDevelopmentMode(isDev: boolean): void {
		this._isDevelopment = isDev;
	}

	public setConsoleLogging(enabled: boolean): void {
		this._enableConsoleLogging = enabled;
	}

	public isDevelopment(): boolean {
		return this._isDevelopment || (globalThis as any).__MOTIF_DEV__ === true;
	}

	public reportSuppressed(context: string, error: any): void {
		this.logIfDev(context, error);
	}

	public report(error: Error): void {
		if (this._enableConsoleLogging) {
			if (error.cause !== undefined) console.error(error.message, error.cause);
			else console.error(error.message);
		}

		try {
			const bus = (globalThis as any).__MOTIF_DEVTOOLS_BUS__;
			if (bus && typeof bus.publish === 'function') {
				bus.publish('error:caught', { context: (error as any).code ?? error.name, error: this.serializeError(error) });
			}
		} catch { /* ignore */ }

		this.emit(error);
	}

	private logIfDev(context: string, error: any): void {
		if (this.isDevelopment() && this._enableConsoleLogging) {
			console.error(`[motifjs Error - ${context}]`, error);
		}

		try {
			const bus = (globalThis as any).__MOTIF_DEVTOOLS_BUS__;
			if (bus && typeof bus.publish === 'function') {
				bus.publish('error:caught', { context, error: this.serializeError(error) });
			}
		} catch { /* ignore */ }
	}


	private serializeError(error: any): any {
		if (!error) return { message: 'Unknown error' };
		if (error instanceof Error) {
			return {
				name: error.name,
				message: error.message,
				stack: error.stack,
				cause: error.cause ? this.serializeError(error.cause) : undefined
			};
		}
		if (typeof error === 'object') {
			try { return JSON.parse(JSON.stringify(error)); } catch { return String(error); }
		}
		return String(error);
	}

	addListener(listener: (error: any) => void): () => void {
		this.listeners.push(listener);
		return () => {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	private emit(error: any): void {
		for (const listener of this.listeners.slice()) {
			listener(error);
		}
	}

	setUnexpectedErrorHandler(handler: (e: any) => void): void {
		this.unexpectedErrorHandler = handler;
	}

	getUnexpectedErrorHandler(): (e: any) => void {
		return this.unexpectedErrorHandler;
	}

	onUnexpectedError(error: any): void {
		this.unexpectedErrorHandler(error);
		this.emit(error);
	}

	public safeCall<T>(fn: () => T, context: string, fallback?: T): T | undefined {
		try {
			return fn();
		} catch (error) {
			this.logIfDev(context, error);
			this.onUnexpectedError(error);
			return fallback;
		}
	}

	public async safeCallAsync<T>(fn: () => Promise<T>, context: string, fallback?: T): Promise<T | undefined> {
		try {
			return await fn();
		} catch (error) {
			this.logIfDev(context, error);
			this.onUnexpectedError(error);
			return fallback;
		}
	}

	public safeCallSilent(fn: () => void, context: string): void {
		try {
			fn();
		} catch (error) {
			this.logIfDev(context, error);
		}
	}

	public async safeCallSilentAsync<T>(fn: () => Promise<T>, context: string): Promise<T | undefined> {
		try {
			return await fn();
		} catch (error) {
			this.logIfDev(context, error);

		}
	}

	public wrapSafe<TArgs extends any[], TReturn>(
		fn: (...args: TArgs) => TReturn,
		context: string
	): (...args: TArgs) => TReturn | undefined {
		return (...args: TArgs) => {
			try {
				return fn(...args);
			} catch (error) {
				this.logIfDev(context, error);
				this.onUnexpectedError(error);
				return undefined;
			}
		};
	}

	public wrapSafeAsync<TArgs extends any[], TReturn>(
		fn: (...args: TArgs) => Promise<TReturn>,
		context: string
	): (...args: TArgs) => Promise<TReturn | undefined> {
		return async (...args: TArgs) => {
			try {
				return await fn(...args);
			} catch (error) {
				this.logIfDev(context, error);
				this.onUnexpectedError(error);
				return undefined;
			}
		};
	}
}

export const errorHandler = new ErrorHandler();


export function setErrorConsoleLogging(enabled: boolean): void {
	errorHandler.setConsoleLogging(enabled);
}

export function safeCall<T>(fn: () => T, context: string, fallback?: T): T | undefined {
	return errorHandler.safeCall(fn, context, fallback);
}

export function safeCallAsync<T>(fn: () => Promise<T>, context: string, fallback?: T): Promise<T | undefined> {
	return errorHandler.safeCallAsync(fn, context, fallback);
}


export function safeCallSilent<T>(fn: () => T, context: string): void {
	errorHandler.safeCallSilent(fn, context);
}


export function safeCallSilentAsync<T>(fn: () => Promise<T>, context: string): Promise<T | undefined> {
	return errorHandler.safeCallSilentAsync(fn, context);
}

export function wrapSafe<TArgs extends any[], TReturn>(
	fn: (...args: TArgs) => TReturn,
	context: string
): (...args: TArgs) => TReturn | undefined {
	return errorHandler.wrapSafe(fn, context);
}

export function wrapSafeAsync<TArgs extends any[], TReturn>(
	fn: (...args: TArgs) => Promise<TReturn>,
	context: string
): (...args: TArgs) => Promise<TReturn | undefined> {
	return errorHandler.wrapSafeAsync(fn, context);
}

export function setUnexpectedErrorHandler(handler: (e: any) => void): void {
	errorHandler.setUnexpectedErrorHandler(handler);
}
