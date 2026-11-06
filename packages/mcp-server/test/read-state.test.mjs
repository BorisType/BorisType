import assert from "node:assert/strict";
import { test } from "node:test";
import { ReadState } from "../build/tools/read-state.js";

const read = (startOffset = 0, endOffset = 3, totalLength = 3) => ({
  apiVersion: 2,
  content: "x".repeat(endOffset - startOffset),
  sha256: "a".repeat(64),
  bom: false,
  startLine: 1,
  endLine: 1,
  totalLines: 1,
  startOffset,
  endOffset,
  totalLength,
});

test("using a grant does not extend its lifetime; a fresh read does", () => {
  let now = 0;
  const state = new ReadState(() => now);
  const token = state.record("url", read());
  now = 29 * 60000;
  state.require("url", token);
  now = 30 * 60000;
  assert.throws(() => state.require("url", token), /ReadRequired/);
  let second = state.record("url", read());
  now += 29 * 60000;
  const refreshed = state.record("url", read(), second);
  assert.notEqual(refreshed, second);
  second = refreshed;
  now += 29 * 60000;
  assert.equal(state.require("url", second).sha256, "a".repeat(64));
});

test("snapshot eviction bounds memory and requires rereading the oldest URL", () => {
  const state = new ReadState();
  const oldest = state.record("file0", read());
  let latest;
  for (let i = 1; i <= 128; i++) latest = state.record("file" + i, read());
  assert.throws(() => state.require("file0", oldest), /ReadRequired/);
  state.require("file128", latest);
});

test("range overflow fails without granting an unread gap or damaging earlier coverage", () => {
  const state = new ReadState();
  let token = state.record("file", read(0, 1, 1024));
  for (let i = 1; i < 256; i++) token = state.record("file", read(2 * i, 2 * i + 1, 1024), token);
  assert.throws(() => state.record("file", read(512, 513, 1024), token), /ReadLimit/);
  assert.equal(state.require("file", token).ranges.length, 256);
  assert.throws(() => state.require("file", token, undefined, true), /ReadRequired/);
  token = state.record("file", read(0, 1024, 1024), token);
  assert.deepEqual(state.require("file", token, undefined, true).ranges, [{ start: 0, end: 1024 }]);
});

test("an empty file is fully read; tokens cannot be used with another URL or hash", () => {
  const state = new ReadState();
  const token = state.record("file", read(0, 0, 0));
  state.require("file", token, undefined, true);
  assert.throws(() => state.require("alias", token), /ReadRequired/);
  assert.throws(() => state.require("file", token, "b".repeat(64)), /Conflict/);
});

test("queued operations wait for completion and a failure does not poison the queue", async () => {
  const state = new ReadState();
  const order = [];
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const first = state.run(async () => {
    order.push(1);
    await barrier;
    order.push(2);
    throw new Error("failed");
  });
  const failed = assert.rejects(first, /failed/);
  const second = state.run(async () => {
    order.push(3);
    return "ok";
  });
  await Promise.resolve();
  assert.deepEqual(order, [1]);
  release();
  assert.equal(await second, "ok");
  await failed;
  assert.deepEqual(order, [1, 2, 3]);
});
