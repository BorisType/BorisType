import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectReadState } from "../build/tools/object-state.js";

const read = (id = "1") => ({ id, formUrl: "x-local://wtv/probe.xmd", xml: "<probe/>", schemaXml: "<probe/>" });

test("object read grants expire and cannot survive a newer read", () => {
  let now = 0;
  const reads = new ObjectReadState(() => now);
  const old = reads.record(read());
  const latest = reads.record(read());
  assert.throws(() => reads.consume("1", old), /ReadRequired/);
  assert.equal(reads.consume("1", latest).xml, "<probe/>");
  const expiring = reads.record(read());
  now = 30 * 60 * 1000;
  assert.throws(() => reads.consume("1", expiring), /ReadRequired/);
});

test("object grants are bounded, tied to identity and consumed once", () => {
  const reads = new ObjectReadState();
  const first = reads.record(read("1"));
  for (let i = 2; i <= 33; i++) reads.record(read(String(i)));
  assert.throws(() => reads.consume("1", first), /ReadRequired/);
  const token = reads.record(read("34"));
  assert.throws(() => reads.consume("35", token), /ReadRequired/);
  assert.equal(reads.consume("34", token).id, "34");
  assert.throws(() => reads.consume("34", token), /ReadRequired/);
});

test("concurrent object operations serialize and one failed action does not block later work", async () => {
  const reads = new ObjectReadState();
  const token = reads.record(read());
  const attempts = [1, 2].map(() => reads.run(async () => reads.consume("1", token)));
  const outcomes = await Promise.allSettled(attempts);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await reads.run(async () => "alive"), "alive");
});
