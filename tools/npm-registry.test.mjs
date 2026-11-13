import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import * as registry from "./npm-registry.mjs";

const target = { name: "@boristype/ws-client", version: "0.1.0-alpha.3", channel: "next" };
const bytes = Buffer.from("reviewed archive");
const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");

function clock(timeoutMs = 1000) {
  let time = 0;
  const delays = [];
  return {
    timeoutMs,
    now: () => time,
    wait: async (ms) => {
      delays.push(ms);
      time += ms;
    },
    delays,
    intervalMs: 10,
  };
}

async function server(t, handler) {
  const instance = createServer(handler);
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => instance.close(resolve)));
  return `http://127.0.0.1:${instance.address().port}`;
}

test("publication verification waits for metadata and the exact archive, including an existing version", async (t) => {
  let reads = 0;
  let downloads = 0;
  const base = await server(t, (req, res) => {
    if (req.url === "/archive.tgz") {
      downloads++;
      res.writeHead(downloads === 1 ? 404 : 200);
      res.end(downloads === 1 ? "pending" : bytes);
      return;
    }
    assert.match(req.headers.accept, /install-v1/);
    assert.equal(req.headers["cache-control"], "no-cache");
    reads++;
    res.writeHead(reads === 1 ? 404 : 200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: target.name,
        versions: { [target.version]: { dist: { integrity, tarball: `${base}/archive.tgz` } } },
        "dist-tags": { next: target.version },
      }),
    );
  });
  const timing = clock();
  await registry.verifyPublication(target, bytes, { base, ...timing });
  assert.equal(downloads, 2);
  assert.equal(reads, 3);
  assert.equal(timing.delays.length, 2);
  await registry.verifyPublication(target, bytes, { base, ...clock() });
  assert.equal(downloads, 3, "an existing version still requires the real archive");
});

test("a matching metadata hash cannot hide corrupt or oversized archive bytes", async (t) => {
  let archive = Buffer.from("wrong archive");
  const base = await server(t, (req, res) => {
    if (req.url === "/archive.tgz") return res.end(archive);
    res.end(
      JSON.stringify({
        name: target.name,
        versions: { [target.version]: { dist: { integrity, tarball: `${base}/archive.tgz` } } },
        "dist-tags": {},
      }),
    );
  });
  await assert.rejects(registry.verifyPublication(target, bytes, { base, ...clock() }), /integrity|bytes/i);
  archive = Buffer.alloc(bytes.length + 1);
  await assert.rejects(registry.verifyPublication(target, bytes, { base, ...clock() }), /size|larger/i);
});

test("HTTP 429 respects Retry-After and transient server failures are retried", async (t) => {
  let reads = 0;
  const base = await server(t, (_req, res) => {
    reads++;
    if (reads === 1) {
      res.writeHead(429, { "Retry-After": "0.1" });
      return res.end();
    }
    if (reads === 2) {
      res.writeHead(503);
      return res.end();
    }
    res.end(JSON.stringify({ name: target.name, versions: {}, "dist-tags": {} }));
  });
  const timing = clock();
  const result = await registry.retryRegistryRead((remaining) => registry.registryPackage(target.name, base, remaining), timing);
  assert.equal(result.name, target.name);
  assert.equal(reads, 3);
  assert.ok(timing.delays[0] >= 100);
});

test("authentication and malformed metadata fail immediately without retrying", async (t) => {
  let status = 401;
  let reads = 0;
  const base = await server(t, (_req, res) => {
    reads++;
    res.writeHead(status);
    res.end("{}");
  });
  for (status of [401, 403, 200]) {
    const timing = clock();
    const before = reads;
    await assert.rejects(
      registry.retryRegistryRead((remaining) => registry.registryPackage(target.name, base, remaining), timing),
      status === 200 ? /metadata/ : new RegExp(String(status)),
    );
    assert.equal(reads, before + 1);
    assert.deepEqual(timing.delays, []);
  }
});

test("polling uses a deadline and never probes or sleeps after it", async () => {
  const timing = clock(25);
  let reads = 0;
  await assert.rejects(
    registry.waitForRegistry(async () => {
      reads++;
      return undefined;
    }, timing),
    /timed out|deadline/i,
  );
  assert.equal(reads, 2);
  assert.deepEqual(timing.delays, [10, 15]);
});

test("sequential reads share the remaining deadline rather than resetting the request budget", async () => {
  let time = 0;
  await registry.waitForRegistry(
    async (_initial, remaining) => {
      assert.equal(remaining(), 25);
      time = 20;
      assert.equal(remaining(), 5);
      return true;
    },
    { timeoutMs: 25, now: () => time },
  );
});

test("a lost metadata response body is retried as a network failure", async (t) => {
  let reads = 0;
  const base = await server(t, (_req, res) => {
    reads++;
    if (reads === 1) {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": "1000" });
      res.write('{"name":');
      setTimeout(() => res.destroy(), 5);
      return;
    }
    res.end(JSON.stringify({ name: target.name, versions: {}, "dist-tags": {} }));
  });
  const result = await registry.retryRegistryRead((remaining) => registry.registryPackage(target.name, base, remaining), clock());
  assert.equal(result.name, target.name);
  assert.equal(reads, 2);
});

test("dependency readiness is checked together before a consumer can publish", async (t) => {
  const dependencies = [
    { name: "@boristype/ws-client", version: "0.1.0-alpha.3" },
    { name: "@boristype/ws-version", version: "0.1.0-alpha.2" },
  ];
  let secondReads = 0;
  const seen = [];
  const base = await server(t, (req, res) => {
    if (req.url === "/archive.tgz") return res.end(bytes);
    const name = decodeURIComponent(req.url.slice(1));
    const dependency = dependencies.find((item) => item.name === name);
    seen.push(name);
    if (name === dependencies[1].name && ++secondReads === 1) {
      res.writeHead(404);
      return res.end();
    }
    res.end(
      JSON.stringify({
        name,
        versions: { [dependency.version]: { dist: { integrity, tarball: `${base}/archive.tgz` } } },
        "dist-tags": {},
      }),
    );
  });
  await registry.waitForDependencies(dependencies, { base, ...clock() });
  assert.equal(secondReads, 2);
  assert.ok(seen.includes(dependencies[0].name));
});

test("a transient dependency failure cannot mask another dependency's authentication failure", async (t) => {
  const base = await server(t, (req, res) => {
    const first = decodeURIComponent(req.url).includes("ws-client");
    res.writeHead(first ? 503 : 403);
    res.end();
  });
  const timing = clock(50);
  await assert.rejects(
    registry.waitForDependencies(
      [
        { name: "@boristype/ws-client", version: "1.0.0" },
        { name: "@boristype/ws-version", version: "1.0.0" },
      ],
      { base, ...timing },
    ),
    /403/,
  );
  assert.deepEqual(timing.delays, []);
});

test("tarball redirects cannot move verification outside the registry", async (t) => {
  const base = await server(t, (req, res) => {
    if (req.url === "/archive.tgz") {
      res.writeHead(302, { Location: "https://example.com/secret" });
      return res.end();
    }
    res.end(
      JSON.stringify({
        name: target.name,
        versions: { [target.version]: { dist: { integrity, tarball: `${base}/archive.tgz` } } },
        "dist-tags": {},
      }),
    );
  });
  await assert.rejects(registry.verifyPublication(target, bytes, { base, ...clock() }), /redirect|HTTP 302/i);
});
