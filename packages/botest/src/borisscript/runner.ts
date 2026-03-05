import { JsEvalCodeAsyncExt, JsGlobalEnv, JsParseCode, SourceInfo } from "./patch";

type JsEvalReturnValue = {
    err: any;
    retVal: any;
};

export async function evalBorisScriptAsync(code: string, filePath?: string, timeout: number = 30000): Promise<any> {
    let sourceInfo: SourceInfo | undefined = undefined;
    if (filePath) {
        sourceInfo = {};
        sourceInfo.sourceUrl = `x-local://${filePath.replaceAll("\\", "/")}`;
    }

    return new Promise((resolve, reject) => {
        let isResolved = false;
        
        // Таймаут для защиты от зависания
        const timeoutId = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                reject(new Error(`BorisScript execution timeout (${timeout}ms). Code may have infinite loop or be stuck.`));
            }
        }, timeout);

        try {
            JsEvalCodeAsyncExt(JsParseCode(code, sourceInfo), JsGlobalEnv(), undefined, (result: JsEvalReturnValue) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutId);
                    
                    if (result.err) {
                        reject(result.err);
                    } else {
                        resolve(result.retVal);
                    }
                }
            });
        } catch (error) {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeoutId);
                reject(error);
            }
        }
    });
}