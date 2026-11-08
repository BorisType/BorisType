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
