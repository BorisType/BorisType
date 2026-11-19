import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { WshcmClient } from "../build/index.js";

test("SOAP response preserves UTF-8 characters split across HTTP chunks", { timeout: 5000 }, async (t) => {
  const expected = "  中👋éЯ\n  ";
  const server = createServer(async (request, response) => {
    request.resume();
    response.writeHead(200, { "Content-Type": "text/xml; charset=utf-8" });
    response.write(
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CallMethodResponse><ResultData><Result VALUE-TYPE="string">',
    );
    for (const byte of Buffer.from(expected, "utf8")) {
      // Write one byte per HTTP chunk, including boundaries inside 2/3/4-byte characters.
      response.write(Buffer.from([byte]));
      await setTimeout(5);
    }
    response.end("</Result></ResultData></CallMethodResponse></soap:Body></soap:Envelope>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new WshcmClient({
    overHttps: false,
    host: "127.0.0.1",
    port: server.address().port,
    username: "fixture",
    password: "fixture",
    requestTimeout: 2000,
  });
  assert.equal(await client.callMethod("tools", "fixture"), expected);
});

async function fixture(t, handler) {
  const server = createServer((request, response) => {
    request.resume();
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return new WshcmClient({
    host: "127.0.0.1",
    port: server.address().port,
    overHttps: false,
    username: "fixture",
    password: "secret",
    requestTimeout: 300,
  });
}

test("login and SOAP distinguish HTTP service and authentication failures without response disclosure", async (t) => {
  let status;
  const client = await fixture(t, (_req, res) => {
    res.writeHead(status, { "set-cookie": "private=header" });
    res.end("<html>sensitive upstream diagnostics</html>");
  });
  for (status of [401, 403, 503]) {
    for (const run of [() => client.initialize(), () => client.callMethod("tools", "fixture")]) {
      await assert.rejects(run(), (err) => {
        assert.equal(err.kind, status === 503 ? "http" : "authentication");
        assert.equal(err.statusCode, status);
        assert.doesNotMatch(String(err), /private|sensitive|secret/);
        return true;
      });
    }
  }
});

test("HTTP 500 SOAP fault keeps the native diagnostic", async (t) => {
  const client = await fixture(t, (_req, res) => {
    res.writeHead(500);
    res.end(
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>Server</faultcode><faultstring>Native failure</faultstring></s:Fault></s:Body></s:Envelope>',
    );
  });
  await assert.rejects(client.callMethod("tools", "fixture"), { message: "ERR: (Server) Native failure", name: "WshcmSoapFault" });
});

test("per-request deadline covers slow streamed login, independent of the next ordinary call", async (t) => {
  const client = await fixture(t, (_req, res) => {
    res.writeHead(200);
    const interval = globalThis.setInterval(() => res.write(" "), 10);
    const end = globalThis.setTimeout(() => res.end('<ResultData><Result VALUE-TYPE="integer">1</Result></ResultData>'), 120);
    res.on("close", () => {
      clearInterval(interval);
      clearTimeout(end);
    });
  });
  await assert.rejects(client.initialize({ timeoutMs: 40 }), { kind: "timeout" });
  assert.equal(await client.callMethod("tools", "fixture"), 1n);
});

test("response lost after its headers is a network failure", { timeout: 2000 }, async (t) => {
  const client = await fixture(t, (_req, res) => {
    res.writeHead(200);
    res.write("<unfinished>");
    globalThis.setTimeout(() => res.destroy(), 10);
  });
  await assert.rejects(client.callMethod("tools", "fixture"), { kind: "network" });
});

test("an HTTP error page with a Fault-like field remains a redacted HTTP error", async (t) => {
  const client = await fixture(t, (_req, res) => {
    res.writeHead(502);
    res.end("<html><Fault><faultstring>private details</faultstring></Fault></html>");
  });
  await assert.rejects(client.callMethod("tools", "fixture"), (err) => {
    assert.equal(err.kind, "http");
    assert.doesNotMatch(err.message, /private/);
    return true;
  });
});

test("reauthentication replaces expired session cookies on the existing client", async (t) => {
  let logins = 0;
  const stale = Promise.withResolvers();
  const client = await fixture(t, (req, res) => {
    if (req.method === "GET") {
      if (req.headers.cookie) {
        res.writeHead(401);
        res.end();
        return;
      }
      logins++;
      res.setHeader("Set-Cookie", `sid=session${logins}; Path=/`);
      res.end();
    } else if (logins === 1) {
      stale.resolve(res);
    } else if (req.headers.cookie !== "sid=session2") {
      res.writeHead(401);
      res.end();
    } else res.end('<ResultData><Result VALUE-TYPE="bool">1</Result></ResultData>');
  });
  await client.initialize();
  const oldCall = client.callMethod("tools", "old");
  const oldResponse = await stale.promise;
  try {
    await client.initialize();
  } finally {
    oldResponse.setHeader("Set-Cookie", "sid=expired");
    oldResponse.end('<ResultData><Result VALUE-TYPE="bool">1</Result></ResultData>');
    await oldCall;
  }
  assert.equal(await client.callMethod("tools", "fixture"), true);
});

test("explicit evaluator initialization uploads the same owned module again", { timeout: 3000 }, async (t) => {
  const uploads = [];
  const client = await fixture(t, (req, res) => {
    let xml = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (xml += chunk));
    req.on("end", () => {
      assert.match(xml, /<MethodName>put_url_text_server<\/MethodName>/);
      uploads.push(xml);
      res.end('<ResultData><Result VALUE-TYPE="bool">1</Result></ResultData>');
    });
  });
  const evaluator = client.createEvaluator();
  await evaluator.initialize();
  await evaluator.initialize();
  assert.equal(uploads.length, 1);
  await evaluator.initialize({ force: true, timeoutMs: 200 });
  assert.deepEqual(uploads, [uploads[0], uploads[0]]);
});

test("HTTP 500 trusts SOAP namespaces on the envelope, body and fault", async (t) => {
  const ns = "http://schemas.xmlsoap.org/soap/envelope/";
  const diagnostic = "<faultcode>Server</faultcode><faultstring>Fixture detail</faultstring>";
  let xml;
  const client = await fixture(t, (_req, res) => {
    res.writeHead(500);
    res.end(xml);
  });
  const cases = [
    ["inherited alias", `<s:Envelope xmlns:s="${ns}" xmlns:f="${ns}"><f:Body><f:Fault>${diagnostic}</f:Fault></f:Body></s:Envelope>`, true],
    ["default namespace", `<Envelope xmlns="${ns}"><Body><Fault>${diagnostic}</Fault></Body></Envelope>`, true],
    [
      "alias declared on Fault",
      `<s:Envelope xmlns:s="${ns}"><Body xmlns="${ns}"><f:Fault xmlns:f="${ns}">${diagnostic}</f:Fault></Body></s:Envelope>`,
      true,
    ],
    [
      "application Fault",
      `<s:Envelope xmlns:s="${ns}" xmlns:a="urn:app"><s:Body><a:Fault>${diagnostic}</a:Fault></s:Body></s:Envelope>`,
      false,
    ],
    [
      "rebound Body",
      `<s:Envelope xmlns:s="${ns}"><s:Body xmlns:s="urn:app"><s:Fault xmlns:s="${ns}">${diagnostic}</s:Fault></s:Body></s:Envelope>`,
      false,
    ],
    ["cleared default", `<Envelope xmlns="${ns}"><Body><Fault xmlns="">${diagnostic}</Fault></Body></Envelope>`, false],
    [
      "different SOAP version",
      `<s:Envelope xmlns:s="${ns}"><s:Body><s:Fault xmlns:s="http://www.w3.org/2003/05/soap-envelope">${diagnostic}</s:Fault></s:Body></s:Envelope>`,
      false,
    ],
  ];
  for (const [label, body, isSoap] of cases) {
    await t.test(label, async () => {
      xml = body;
      await assert.rejects(client.callMethod("tools", "fixture"), (error) => {
        if (isSoap) {
          assert.equal(error.name, "WshcmSoapFault");
          assert.equal(error.message, "ERR: (Server) Fixture detail");
        } else {
          assert.equal(error.kind, "http");
          assert.equal(error.statusCode, 500);
          assert.doesNotMatch(error.message, /Fixture detail/);
        }
        return true;
      });
    });
  }
});
