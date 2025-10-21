import { JsEvalCodeAsyncExt, JsGlobalEnv, JsParseCode } from "./patch";

type JsEvalReturnValue = {
    err: any;
    retVal: any;
};

export async function evalBorisScriptAsync(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
        JsEvalCodeAsyncExt(JsParseCode(code), JsGlobalEnv(), undefined, (result: JsEvalReturnValue) => {
            if (result.err) {
                reject(result.err);
            } else {
                resolve(result.retVal);
            }
        });
    });
}