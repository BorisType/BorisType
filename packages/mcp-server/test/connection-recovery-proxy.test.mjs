import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { renderRequest } from "../../ws-client/build/soap-utils.js";
import { openRecoveryProxy } from "./e2e/connection-recovery-proxy.mjs";

const login = "/spxml_web/main.htm";
const soap = "/api/spxml/CallMethod";
const url = "x-local://wt/unsafe_eval_" + "X".repeat(32) + ".bs";
const upload = renderRequest("tools", "put_url_text_server", [url, "test-owned helper"]);
const probe = renderRequest(url, "execute", ["return 1;"]);
const business = renderRequest(url, "execute", ["return 2;"]);

test("recovery proxy blocks offline traffic and drops only the selected upstream response", async (t) => {
  const requests = [];
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    requests.push({ path: req.url, body });
    res.setHeader("set-cookie", "session=fixture-cookie");
    res.end(body || "login");
  });
  t.after(() => upstream.close());
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const proxy = await openRecoveryProxy(new URL("http://127.0.0.1:" + upstream.address().port));
  t.after(() => proxy.close());
  const get = () => fetch(proxy.url + login);
  const post = (body) => fetch(proxy.url + soap, { method: "POST", body });

  assert.equal((await get()).status, 503);
  assert.deepEqual(requests, []);
  proxy.mode = 401;
  assert.equal((await get()).status, 401);
  assert.deepEqual(requests, []);
  proxy.mode = "online";
  assert.equal((await get()).headers.get("set-cookie"), "session=fixture-cookie");
  assert.equal(await (await post(upload)).text(), upload);
  proxy.next = { kind: "probe", action: "missing-module" };
  assert.match(await (await post(probe)).text(), /Evaluator module missing/);
  assert.equal(await (await post(probe)).text(), probe);
  proxy.next = { kind: "business", action: "drop-response" };
  await assert.rejects(post(business));
  assert.equal(await (await post(business)).text(), business);
  assert.deepEqual(
    requests.map(({ body }) => body),
    ["", upload, probe, business, business],
  );
  assert.deepEqual(
    proxy.exchanges.map(({ kind, delivery }) => [kind, delivery]),
    [
      ["login", "offline"],
      ["login", "authentication"],
      ["login", "forwarded"],
      ["upload", "forwarded"],
      ["probe", "missing-module"],
      ["probe", "forwarded"],
      ["business", "drop-response"],
      ["business", "forwarded"],
    ],
  );
  assert.deepEqual(proxy.errors, []);
});
