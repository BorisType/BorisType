/** Small research utilities; no target runtime import in the parent process. */
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";

export const targetWorker = new URL("./expression-worker.mjs", import.meta.url);

/** SHA-256 identity for source, output, libraries and the approved private runtime. */
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Strict CLI: explicit named cases, applicable modes and nonzero selection. */
export function selectExpressionCases(catalog, args) {
  const ids = new Set();
  const modes = new Set();
  let baseline = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--baseline") baseline = true;
    else if (arg === "--case" || arg === "--mode") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--case") {
        if (!catalog.some((item) => item.id === value)) throw new Error(`Unknown case: ${value}`);
        ids.add(value);
      } else {
        if (!["bare", "script", "module"].includes(value)) throw new Error(`Unknown mode: ${value}`);
        modes.add(value);
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (new Set(catalog.map((item) => item.id)).size !== catalog.length) throw new Error("Duplicate case IDs");
  // An explicitly requested pair must not disappear just because another pair is applicable.
  for (const id of ids) {
    const supported = catalog.find((item) => item.id === id).modes ?? ["script", "module"];
    for (const mode of modes) if (!supported.includes(mode)) throw new Error(`Case ${id} does not cover requested mode ${mode}`);
  }
  const selected = catalog.flatMap((item) => {
    if (ids.size && !ids.has(item.id)) return [];
    return (item.modes ?? ["script", "module"]).filter((mode) => !modes.size || modes.has(mode)).map((mode) => ({ item, mode }));
  });
  if (!selected.length) throw new Error("Empty selection: these cases do not cover the requested modes");
  return { selected, baseline };
}

/** Exact xfail matching: a changed failure and an unexpected fix both require review. */
export function classifyExpressionResult(expected, actual, known, baseline) {
  if (actual === expected) return baseline && known ? "XPASS" : "PASS";
  if (baseline && known && known.actual === actual && known.expected === expected) return "XFAIL";
  return "FAIL";
}

/** Process watchdog includes adapter load/init; no Promise timeout is trusted for native code. */
export function runIsolatedTarget(payload, { timeoutMs = 10000, worker = targetWorker } = {}) {
  return new Promise((resolve, reject) => {
    // Never relay raw interpreter stdout/stderr: a fatal adapter error could print private runtime source.
    const child = fork(worker, [], { cwd: payload.root, stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: [] });
    let finished = false;
    let response;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Target process timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    child.once("error", (error) => {
      child.kill("SIGKILL");
      finish(error);
    });
    child.once("message", (message) => {
      response = message;
    });
    child.once("exit", (code, signal) => {
      if (response?.ok && typeof response.value === "string" && code === 0) finish(null, response.value);
      else finish(new Error(response?.error ?? `Target worker exited (${code ?? signal}) without a valid result`));
    });
    child.send(payload, (error) => {
      if (error) {
        child.kill("SIGKILL");
        finish(error);
      }
    });
  });
}

/** Static output counts, not measured runtime allocations or timing. Includes emitted scaffolding. */
export function expressionOutputMetrics(code, ir) {
  const file = ts.createSourceFile("output.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length) throw new Error("Generated output failed structural parsing");
  const metrics = { bytes: Buffer.byteLength(code), irNodes: 0, generatedBindings: 0, callSites: {}, arraySites: 0, objectSites: 0 };
  const bindings = new Set();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text.startsWith("__")) bindings.add(node.name.text);
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      metrics.callSites[name] = (metrics.callSites[name] ?? 0) + 1;
    }
    if (ts.isArrayLiteralExpression(node)) metrics.arraySites++;
    if (ts.isObjectLiteralExpression(node) || (ts.isNewExpression(node) && node.expression.getText(file) === "SafeObject"))
      metrics.objectSites++;
    ts.forEachChild(node, visit);
  }
  visit(file);
  function count(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.kind === "string") metrics.irNodes++;
    for (const [key, child] of Object.entries(value)) if (key !== "loc") count(child);
  }
  count(ir);
  metrics.generatedBindings = bindings.size;
  return metrics;
}
