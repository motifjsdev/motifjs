import { safeCallSilentAsync } from "./ErrorHandler";
import { reportError } from "./diagnostics";

export class OperationRunner {

    public static run(operation: () => void, onError?: (error: any) => void): void {
        try {
            operation();
        } catch (error) {
            if (onError) {
                onError(error);
            } else {
                reportError('MJX609', error);
            }
        }
    }

    public static runAsync<T>(operation: () => Promise<T>, onError?: (error: any) => void, onSuccess?: (value: T) => void): void {
        safeCallSilentAsync<T>(operation, 'OperationRunner.runasync.preCall')
            .catch(error => { onError ? onError(error) : reportError('MJX609', error); })
            .then((value) => {
                if (onSuccess) {
                    onSuccess(value!);
                }
            });
    }
    public static runPromise(operation: () => Promise<void>, onError?: (error: any) => void): Promise<void> {
        return operation().catch(error => {
            if (onError) {
                onError(error);
            } else {
                reportError('MJX609', error);
            }
        });
    }

}