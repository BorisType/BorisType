/** Target-only worker: the parent watchdog can kill a synchronously stuck interpreter. */
import { relative } from "node:path";

process.once("message", async ({ root, code, outputPath, mode }) => {
  try {
    process.chdir(root);
    const { evalBorisScriptAsync } = await import("../../../botest/build/borisscript/runner.js");
    await evalBorisScriptAsync(`
RegisterCodeLibrary('x-local://packages/builtin-runtime/build/polyfill.js');
RegisterCodeLibrary('x-local://packages/builtin-runtime/build/semantic.js');
RegisterCodeLibrary('x-local://packages/builtin-runtime/build/destructuring.js');
bt.init_polyfill();
`);
    const url = "x-local://" + relative(root, outputPath).replaceAll("\\", "/");
    const execution =
      mode === "module"
        ? `
RegisterCodeLibrary('${url}');
var library = OpenCodeLibrary('${url}');
var module = {exports: new SafeObject()};
library.__init(library, module);
return module.exports.result;
`
        : code + "\nreturn result;";
    const value = await evalBorisScriptAsync(execution, outputPath);
    if (typeof value !== "string") throw new Error(`Probe must return a string, got ${typeof value}`);
    process.send({ ok: true, value }, () => process.exit(0));
  } catch (error) {
    // Do not serialize arbitrary native error objects (they may contain interpreter internals).
    process.send({ ok: false, error: String(error?.message ?? error) }, () => process.exit(1));
  }
});
