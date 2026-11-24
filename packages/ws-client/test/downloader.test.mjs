import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import * as sdk from "../build/index.js";

async function setup(t, entries, transform = (response) => response) {
  const directory = await mkdtemp(join(tmpdir(), "bt-download-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "copy");
  const requests = [];
  const evaluator = {
    async eval(script) {
      let request;
      const root = "/stand/sample";
      const lookup = (path) => entries[path === root ? "" : path.slice(root.length + 1)];
      const wire = runInNewContext("(function(){" + script + "})()", {
        ParseJson(text) {
          request = JSON.parse(text);
          requests.push(request);
          return request;
        },
        EncodeJson: JSON.stringify,
        tools: {
          dotnet_host: {
            Object: {
              GetAssembly: () => ({
                CallClassStaticMethod(_, method, [value]) {
                  if (method === "IsPathFullyQualified") return posix.isAbsolute(value);
                  if (method === "GetFullPath") return value;
                  assert.equal(method, "GetAttributes");
                  return { ToString: () => (lookup(value)?.kind === "link" ? "ReparsePoint" : "Normal") };
                },
              }),
            },
          },
        },
        FilePath: posix.join,
        UrlToFilePath: () => root,
        StrBegins: (s, prefix) => s.startsWith(prefix),
        StrContains: (s, part) => s.includes(part),
        ParentDirectory: posix.dirname,
        IsDirectory: (path) => lookup(path)?.kind === "directory",
        ReadDirectoryByPath: (path) => lookup(path).names.map((name) => posix.join(path, name)),
        FileName: posix.basename,
        FileSize: (path) => lookup(path).length,
        GetFileModDate: () => "v1",
        StrDate: (value) => value,
        ArrayCount: (items) => items.length,
        Base64Encode: (bytes) => bytes.toString("base64"),
        LoadFileDataRange: (path, start, end) => lookup(path).subarray(start, end),
      });
      return JSON.stringify(transform(JSON.parse(wire), request, requests));
    },
  };
  return {
    directory,
    destination,
    requests,
    downloader: new sdk.WshcmDownloader({ evaluator, path: "x-local://wt/sample", destination, chunkSize: 3 }),
  };
}

test("downloads nested binary data, empty files/directories and skips links; transfers byte ranges", async (t) => {
  const bytes = Buffer.from([0, 255, 10, 13, 127, 128, 32]);
  const { downloader, destination, requests } = await setup(t, {
    "": { kind: "directory", names: ["empty", "sub", "link", ".zero"] },
    empty: { kind: "directory", names: [] },
    sub: { kind: "directory", names: ["binary"] },
    "sub/binary": bytes,
    link: { kind: "link" },
    ".zero": Buffer.alloc(0),
  });
  const progress = [];
  const result = await downloader.download((count, total) => progress.push([count, total]));
  assert.deepEqual(await readFile(join(destination, "sub", "binary")), bytes);
  assert.deepEqual(await readdir(join(destination, "empty")), []);
  assert.equal((await readFile(join(destination, ".zero"))).length, 0);
  assert.deepEqual((await readdir(destination)).sort(), [".zero", "empty", "sub"]);
  assert.deepEqual(result, { path: destination, files: 2, bytes: 7, skippedLinks: 1 });
  assert.deepEqual(
    requests.filter((r) => r.operation === "read").map(({ start, end }) => [start, end]),
    [
      [0, 3],
      [3, 6],
      [6, 7],
    ],
  );
  assert.deepEqual(progress.at(-1), [7, 7]);
});

test("publishes a single file under the exact destination once, including concurrent downloads", async (t) => {
  const bytes = Buffer.from("123456");
  const { downloader, destination } = await setup(t, { "": bytes });
  const outcomes = await Promise.allSettled([downloader.download(), downloader.download()]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.deepEqual(await readFile(destination), bytes);
});

test("rejects dangerous remote names and cleans up malformed, interrupted or changed transfers", async (t) => {
  for (const fault of ["name", "short", "encoding", "changed", "network"]) {
    const { downloader, directory } = await setup(
      t,
      { "": { kind: "directory", names: ["file"] }, file: Buffer.from("12345") },
      (res, r, requests) => {
        if (fault === "name" && res.kind === "directory") return { ...res, names: ["../outside"] };
        if (r.operation === "read" && r.start > 0) {
          if (fault === "short") return { data: "" };
          if (fault === "encoding") return { data: "%%%=" };
          if (fault === "network") throw new Error("offline");
        }
        if (fault === "changed" && res.kind === "file" && requests.some((v) => v.operation === "read")) return { ...res, modified: "v2" };
        return res;
      },
    );
    await assert.rejects(downloader.download());
    assert.deepEqual(await readdir(directory), []);
  }
});

test("existing destination contents survive a download attempt", async (t) => {
  const { downloader, destination } = await setup(t, { "": Buffer.from("remote") });
  await writeFile(destination, "original");
  await assert.rejects(downloader.download());
  assert.equal(await readFile(destination, "utf8"), "original");
});

test("only one directory download can claim a new destination, even for empty directories", async (t) => {
  const { downloader, directory, destination } = await setup(t, { "": { kind: "directory", names: [] } });
  const outcomes = await Promise.allSettled([downloader.download(), downloader.download()]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.deepEqual(await readdir(destination), []);
  assert.deepEqual(await readdir(directory), ["copy"]);
});

test("rejects a symbolic link used as the download root", async (t) => {
  const { downloader, directory } = await setup(t, { "": { kind: "link" } });
  await assert.rejects(downloader.download(), /symbolic link/);
  assert.deepEqual(await readdir(directory), []);
});
