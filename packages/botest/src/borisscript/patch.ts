import * as path from "path";
import * as fs from "fs";
import * as vm from "vm";
import chalk from "chalk";

const legacyCode = fs.readFileSync(path.join(__dirname, "./main.js"), "utf-8");
const isolatedContext = {
  navigator: {},
  window: {},
  document: {},
  alert: function (msg: any) {
    console.log(`${chalk.yellow("[ALERT]")}  ${msg}`);
  },
};

// Обработчик для фатальных ошибок в интерпретаторе
process.on("uncaughtException", (err) => {
  console.error(
    `${chalk.red("[FATAL ERROR]")} Uncaught Exception in BorisScript interpreter:`,
    err,
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    `${chalk.red("[FATAL ERROR]")} Unhandled Rejection in BorisScript interpreter:`,
    reason,
  );
  process.exit(1);
});

vm.runInNewContext(legacyCode, isolatedContext, { filename: "main.js" });

function readFileWithoutBOM(filePath: string): string {
  const buffer = fs.readFileSync(filePath);

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString("utf8");
  }

  return buffer.toString("utf8");
}

function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== "object" || obj1 === null || typeof obj2 !== "object" || obj2 === null) {
    return false;
  }
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
      return false;
    }
  }
  return true;
}

export type SourceInfo = {
  sourceUrl?: string;
  sourceLineIndex?: number;
};

type BorisScriptContext = {
  JsEvalCodeAsyncExt(code: any, env: any, options: any, completionProc: any): any;
  JsParseCode(codeStr: any, sourceInfo?: SourceInfo): any;
  JsGlobalEnv(): any;

  LoadUrlData(url: any): any;
  BmLoadUrlDataAsync(url: any, completionProc: any): any;

  UrlSchema(urlStr: any): any;
  XmIsLocalDbUrl(url: any): any;
  BmLoadLocalDbUrlData(url: any): any;
  BmInvokeCompletionProcWithRetVal(completionProc: any, retVal: any): any;

  BmResolveArgObject(argsArray: any[], argIndex: number, objectType: string): any;
  BmResolveArgUrl(argsArray: any[], argIndex: number, sourceInfo: any): string;
  BmResolveArgStr(argsArray: any[], argIndex: number): string;

  JsEncodeJsonStr(val: any, options?: any): any;
  BmPreloadUrlsAsync(urls: any[], completionProc: any): any;
  gBmPreloadedUrlCache: { [url: string]: any };
  gXmApplication: any;
  JsGlobal: any;
  BmError: any;
  BmVerboseError(str: string): any;

  gActiveThread: any;
};

const bs = isolatedContext as unknown as BorisScriptContext;

const originalLoadUrlData = bs.LoadUrlData;
bs.LoadUrlData = function (url: any): any {
  if (url == "" || url == undefined) {
    throw "Empty url";
  }

  if (bs.UrlSchema(url) == "x-local") {
    const cwd = process.cwd();
    const filePath = path.resolve(cwd, path.normalize(url.slice(10)));
    return readFileWithoutBOM(filePath);
  } else {
    return originalLoadUrlData.call(bs, url);
  }
};

const originalBmLoadUrlDataAsync = bs.BmLoadUrlDataAsync;
bs.BmLoadUrlDataAsync = function (url: any, completionProc: any): any {
  if (url == "" || url == undefined) {
    throw "Empty url";
  }

  if (bs.XmIsLocalDbUrl(url)) {
    return bs.BmLoadLocalDbUrlData(url);
  }

  let data;
  if ((data = bs.gBmPreloadedUrlCache[url]) != undefined) {
    bs.BmInvokeCompletionProcWithRetVal(completionProc, data);
    return;
  }

  if (bs.UrlSchema(url) == "x-local") {
    const cwd = process.cwd();
    const filePath = path.resolve(cwd, path.normalize(url.slice(10)));
    const content = readFileWithoutBOM(filePath);

    completionProc({ retVal: content });
    return;
  } else {
    return originalBmLoadUrlDataAsync.call(bs, url, completionProc);
  }
};

bs.JsGlobal.prototype.CallassertValueEquals = function (
  argsArray: any[],
  env: any,
  sourceInfo: any,
) {
  if (argsArray[0] !== argsArray[1]) {
    const data = {
      actual: argsArray[0],
      expected: argsArray[1],
      message: argsArray[2],
    };
    throw new bs.BmError(`TEST-RUNNER:assert:${bs.JsEncodeJsonStr(data)}`);
  }
};
bs.JsGlobal.prototype.CallassertJsArrayEquals = function (
  argsArray: any[],
  env: any,
  sourceInfo: any,
) {
  const obj1 = bs.BmResolveArgObject(argsArray, 0, "JsArray");
  const obj2 = bs.BmResolveArgObject(argsArray, 1, "JsArray");

  if (!deepEqual(obj1, obj2)) {
    const data = {
      actual: obj1,
      expected: obj2,
      message: argsArray[2],
    };
    throw new bs.BmError(`TEST-RUNNER:assert:${bs.JsEncodeJsonStr(data)}`);
  }
};
bs.JsGlobal.prototype.CallassertJsObjectEquals = function (
  argsArray: any[],
  env: any,
  sourceInfo: any,
) {
  const obj1 = bs.BmResolveArgObject(argsArray, 0, "JsObject");
  const obj2 = bs.BmResolveArgObject(argsArray, 1, "JsObject");

  if (!deepEqual(obj1, obj2)) {
    const data = {
      actual: obj1,
      expected: obj2,
      message: argsArray[2],
    };
    throw new bs.BmError(`TEST-RUNNER:assert:${bs.JsEncodeJsonStr(data)}`);
  }
};

bs.JsGlobal.prototype.CallOpenCodeLibrary = function (argsArray: any, env: any, sourceInfo: any) {
  let libUrl: any;

  if (env.codeRunner == undefined || !env.codeRunner.isAsync) {
    throw bs.BmVerboseError("Asynchronous operations are not allowed in this context");
  }

  libUrl = bs.BmResolveArgUrl(argsArray, 0, sourceInfo);
  const baseCodeRunner = env.codeRunner;
  baseCodeRunner.SuspendForBlockingCall();

  bs.BmPreloadUrlsAsync([libUrl], function (asyncCallResult: any) {
    const codeLibrary = bs.gXmApplication.codeCollection.OpenCodeLibrary(libUrl);
    baseCodeRunner.ResumeAfterBlockingCall({ retVal: codeLibrary });
  });
};

bs.JsGlobal.prototype.CallUrlExists = function (argsArray: any, env: any, sourceInfo: any) {
  const url = bs.BmResolveArgUrl(argsArray, 0, sourceInfo);
  const path = urlToFilePath(url);

  return fs.existsSync(path);
};
bs.JsGlobal.prototype.CallIsDirectory = function (argsArray: any, env: any, sourceInfo: any) {
  const url = bs.BmResolveArgStr(argsArray, 0);
  const path = urlToFilePath(url);

  try {
    const stats = fs.statSync(path);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
};
bs.JsGlobal.prototype.CallFileExists = function (argsArray: any[], env: any, sourceInfo: any) {
  const path = bs.BmResolveArgStr(argsArray, 0);
  return fs.existsSync(path);
};
bs.JsGlobal.prototype.CallUrlToFilePath = function (argsArray: any[], env: any, sourceInfo: any) {
  const url = bs.BmResolveArgUrl(argsArray, 0, sourceInfo);
  const path = urlToFilePath(url);

  return path;
};
bs.JsGlobal.prototype.GetPropActiveThread = function () {
  if (bs.gActiveThread != undefined) {
    return bs.gActiveThread;
  }
  return null;
};

function urlToFilePath(url: string) {
  const cwd = process.cwd();
  const filePath = path.resolve(cwd, path.normalize(url.slice(10)));
  return filePath;
}

export const JsEvalCodeAsyncExt = bs.JsEvalCodeAsyncExt;
export const JsParseCode = bs.JsParseCode;
export const JsGlobalEnv = bs.JsGlobalEnv;
