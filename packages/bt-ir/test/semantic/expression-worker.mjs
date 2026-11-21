/** Target-only worker: the parent watchdog can kill a synchronously stuck interpreter. */
process.once("message", async ({ root, code, outputPath }) => {
  try {
    process.chdir(root);
    const { evalBorisScriptAsync } = await import("../../../botest/build/borisscript/runner.js");
    await evalBorisScriptAsync(`
RegisterCodeLibrary('x-local://packages/builtin-runtime/build/polyfill.js');
RegisterCodeLibrary('x-local://packages/builtin-runtime/build/semantic.js');
RegisterCodeLibrary('x-local://packages/builtin-runtime/build/destructuring.js');
bt.init_polyfill();
`);
    const value = await evalBorisScriptAsync(code + "\nreturn result;", outputPath);
    if (typeof value !== "string") throw new Error(`Probe must return a string, got ${typeof value}`);
    process.send({ ok: true, value }, () => process.exit(0));
  } catch (error) {
    // Do not serialize arbitrary native error objects (they may contain interpreter internals).
    process.send({ ok: false, error: String(error?.message ?? error) }, () => process.exit(1));
  }
});
