import assert from "node:assert/strict";
import { posix } from "node:path";
import { runInNewContext } from "node:vm";

/** External HCM transport double. Executes real BS templates as JS; no native/.NET semantics claimed. */
export function runtimeTransport(evaluate = () => assert.fail("Unexpected platform operation"), options = {}) {
  const files = new Map();
  const calls = [];
  const process = { pid: 41, startedAt: "2026-11-14T10:00:00.0000000Z", framework: ".NET 9.0.11", architecture: "X64" };
  const identity = (descriptor) => Object.fromEntries(["id", "version", "apiVersion", "buildId"].map((key) => [key, descriptor[key]]));
  const transport = {
    files,
    calls,
    process,
    async eval(script) {
      const bootstrap = script.startsWith("// BorisType runtime bootstrap v1");
      const operation = script.startsWith("// BorisType runtime operation v1");
      if (!bootstrap && !operation) return evaluate(script);
      calls.push(bootstrap ? "bootstrap" : "operation");
      const result = runInNewContext(`(function(){${script}})()`, {
        ParseJson: JSON.parse,
        EncodeJson: JSON.stringify,
        ArrayCount: (items) => items.length,
        AppDirectoryPath: () => "/WebsoftServer",
        FilePath: posix.join,
        ObtainDirectory() {},
        FilePathExists: (path) => files.has(path),
        PutFileData(path, bytes) {
          if (options.uploadError) throw new Error("Permission denied during helper upload");
          assert.ok(!files.has(path), "Helper upload must use a unique temporary path");
          files.set(path, Buffer.from(bytes));
        },
        MoveFile(source, destination) {
          files.set(destination, files.get(source));
          files.delete(source);
        },
        DeleteFile(path) {
          files.delete(path);
        },
        LoadFileData: (path) => {
          assert.ok(files.has(path));
          return files.get(path);
        },
        Base64Decode: (value) => Buffer.from(value, "base64"),
        Base64Encode: (value) => Buffer.from(value).toString("base64"),
        tools: {
          dotnet_host: {
            Object: {
              GetAssembly(path) {
                assert.match(
                  path,
                  /\/bootstrap\/BorisType\.RuntimeBootstrap\.B[0-9a-f]{64}\/BorisType\.RuntimeBootstrap\.B[0-9a-f]{64}\.dll$/i,
                );
                assert.ok(files.has(path), "GetAssembly before helper installation is forbidden");
                return {
                  CallClassStaticMethod(type, method, args) {
                    assert.equal(type, "BorisType.RuntimeBootstrap.EntryPoint");
                    assert.equal(args[0], posix.join("/WebsoftServer", options.installationName ?? ".boristype-runtime"));
                    const expected = identity(JSON.parse(args[1]));
                    calls.push(method);
                    const status = {
                      schemaVersion: 1,
                      status: "ready",
                      reason: "Current",
                      expected,
                      installed: expected,
                      loaded: expected,
                      changed: method === "EnsureJson",
                      process: { ...process },
                    };
                    if (options.status) return JSON.stringify(options.status({ method, args: Array.from(args), expected, status }));
                    return JSON.stringify(status);
                  },
                };
              },
            },
          },
        },
      });
      if (bootstrap && options.afterBootstrap) return options.afterBootstrap(result, transport);
      return result;
    },
  };
  return transport;
}

/** Keep old operation-focused RPC tests behind a validated, real handshake transport boundary. */
export function withReadyRuntime(evaluate) {
  return runtimeTransport(evaluate).eval;
}
