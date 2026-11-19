import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, request } from "node:http";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const helperUrl = /x-local:\/\/wt\/(unsafe_eval_[A-Za-z0-9]{32}\.bs)/;
const fault =
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>Server</faultcode><faultstring>Evaluator module missing (test proxy)</faultstring></s:Fault></s:Body></s:Envelope>';

async function readBody(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function describe(req, bytes) {
  if (req.method === "GET" && req.url === "/spxml_web/main.htm") return { kind: "login" };
  assert.equal(req.method, "POST");
  assert.equal(req.url, "/api/spxml/CallMethod");
  const body = bytes.toString("utf8");
  const method = body.match(/<MethodName>([^<]+)<\/MethodName>/)?.[1];
  const helper = body.match(helperUrl)?.[1];
  assert.ok(helper, "Expected an owned evaluator in the SOAP request");
  const base = { helper, requestSha256: hash(bytes) };
  if (method === "put_url_text_server" && body.includes("<LibName>tools</LibName>")) return { ...base, kind: "upload" };
  assert.ok(body.includes(`<LibName>x-local://wt/${helper}</LibName>`));
  if (method === "drop_self") return { ...base, kind: "cleanup" };
  assert.equal(method, "execute");
  return { ...base, kind: body.includes(">return&#32;1;</arg-0>") ? "probe" : "business" };
}

/** Faults are injected only on the private loopback hop; forwarded bodies and credentials are never logged. */
export async function openRecoveryProxy(upstream, baseline = []) {
  assert.equal(upstream.protocol, "http:");
  const exchanges = [];
  const errors = [];
  let ownedHelper;
  const proxy = { mode: "offline", next: undefined, exchanges, errors };
  const server = createServer(async (req, res) => {
    try {
      const bytes = await readBody(req);
      const entry = describe(req, bytes);
      exchanges.push(entry);
      if (entry.kind === "upload" && ownedHelper === undefined) {
        assert.ok(!baseline.includes(entry.helper), "Evaluator collides with the stand baseline");
        ownedHelper = entry.helper;
      }
      if (entry.helper) assert.equal(entry.helper, ownedHelper, "Only this CLI's evaluator may pass this proxy");
      if (proxy.mode !== "online") {
        entry.delivery = proxy.mode === "offline" ? "offline" : "authentication";
        res.writeHead(proxy.mode === "offline" ? 503 : proxy.mode).end("proxy-private-error-body");
        return;
      }
      const action = proxy.next?.kind === entry.kind ? proxy.next.action : undefined;
      if (action) proxy.next = undefined;
      if (action === "missing-module") {
        assert.equal(entry.kind, "probe");
        entry.delivery = "missing-module";
        res.writeHead(500, { "content-type": "text/xml" }).end(fault);
        return;
      }
      entry.delivery = action ?? "forwarded";
      const headers = { ...req.headers, host: upstream.host, connection: "close" };
      const reply = await new Promise((resolve, reject) => {
        const forward = request(new URL(req.url, upstream), { method: req.method, headers }, (reply) => {
          readBody(reply).then((body) => resolve({ body, status: reply.statusCode, headers: reply.headers }), reject);
        });
        res.on("close", () => forward.destroy());
        forward.on("error", reject);
        forward.setTimeout(60_000, () => forward.destroy(new Error("Upstream response timed out")));
        forward.end(bytes);
      });
      entry.upstreamStatus = reply.status;
      entry.responseSha256 = hash(reply.body);
      if (action === "drop-response") {
        res.destroy();
      } else {
        res.writeHead(reply.status, reply.headers).end(reply.body);
      }
    } catch (error) {
      errors.push(error.code ?? error.name);
      res.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return Object.assign(proxy, {
    url: "http://127.0.0.1:" + server.address().port,
    close() {
      return new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    },
  });
}
