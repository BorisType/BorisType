import assert from "node:assert/strict";
import { test } from "node:test";
import { closeConnection } from "../build/connection.js";

test("connection close requires positive evaluator cleanup confirmation", async () => {
  await closeConnection({ evaluator: { close: async () => true } });
  await assert.rejects(closeConnection({ evaluator: { close: async () => false } }), /cleanup was not confirmed/);
});

test("connection close propagates cleanup errors", async () => {
  const error = new Error("Unavailable");
  await assert.rejects(
    closeConnection({
      evaluator: {
        close: async () => {
          throw error;
        },
      },
    }),
    (received) => received === error,
  );
});

test("close is shared and prevents dispatch after pending initial authentication", { timeout: 5000 }, async (t) => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const { ConnectionManager } = await import("../build/connection-manager.js");
  const started = Promise.withResolvers();
  const paths = [];
  const http = createServer((req, res) => {
    paths.push(req.url);
    started.resolve(res);
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        http.close(resolve);
        http.closeAllConnections();
      }),
  );
  const manager = new ConnectionManager({ host: "127.0.0.1", port: http.address().port, https: false, username: "u", password: "p" });
  const running = manager.eval("return 7;");
  const response = await started.promise;
  const closing = manager.close();
  assert.equal(manager.close(), closing);
  await assert.rejects(manager.eval("return 8;"), { dispatched: false });
  response.end();
  await assert.rejects(running, { dispatched: false });
  await closing;
  assert.deepEqual(paths, ["/spxml_web/main.htm"]);
});

test("eager connections honor the login deadline", { timeout: 3000 }, async (t) => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const { createConnection } = await import("../build/connection.js");
  const http = createServer((_req, res) => {
    const end = setTimeout(() => res.end(), 250);
    res.on("close", () => clearTimeout(end));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        http.close(resolve);
        http.closeAllConnections();
      }),
  );
  await assert.rejects(
    createConnection({ host: "127.0.0.1", port: http.address().port, https: false, username: "u", password: "p", connectionTimeoutMs: 50 }),
    { kind: "timeout" },
  );
});
