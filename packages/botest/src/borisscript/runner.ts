import { JsEvalCodeAsyncExt, JsGlobalEnv, JsParseCode, SourceInfo } from "./patch";

type JsEvalReturnValue = {
  err: any;
  retVal: any;
};

/**
 * Evaluates BorisScript code asynchronously with timeout protection.
 *
 * @param code - BorisScript source code to execute.
 * @param filePath - Optional file path for source mapping in error traces.
 * @param timeout - Maximum execution time in ms (default: 30000).
 * @returns The return value of the evaluated code.
 * @throws Error on timeout, runtime errors, or assertion failures.
 */
export async function evalBorisScriptAsync(
  code: string,
  filePath?: string,
  timeout: number = 30000,
): Promise<any> {
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
        reject(
          new Error(
            `BorisScript execution timeout (${timeout}ms). Code may have infinite loop or be stuck.`,
          ),
        );
      }
    }, timeout);

    try {
      const parsedCode = JsParseCode(code, sourceInfo);
      const env = JsGlobalEnv();

      JsEvalCodeAsyncExt(parsedCode, env, undefined, (result: JsEvalReturnValue) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);

          if (result.err) {
            reject(result.err);
          } else {
            resolve(result.retVal);
          }
        }
        // console.log(result);
      });
    } catch (error) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        reject(error);
      }
      // console.log(error);
    }
  });
}
