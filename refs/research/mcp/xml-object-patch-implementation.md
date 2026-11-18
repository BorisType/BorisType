# XML Object Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver shared tested native partial XML editing through SDK and MCP, preserving untouched fields and avoiding Save on no-op.

**Architecture:** Extend the existing strict XML object path with patch metadata and a reusable native apply helper. SDK owns tokens, preconditions and single Save; MCP is an adapter. Native comparisons use persistent XML snapshots, with dedicated Date/MULTIPLE acceptance.

**Tech Stack:** Node 24/pnpm pins, TypeScript/Zod/saxes, shipped BorisScript resources, Node VM tests, Linux C HCM 2025.2.1333/PostgreSQL Docker acceptance.

**Spec:** [refs/mcp/xml-object-patch.md](../../mcp/xml-object-patch.md).

## Global Constraints

- XML and schema each 256 KiB UTF-8; 8192 input elements; depth 64; request 2 MiB including metadata.
- Exact positive decimal string IDs; integer XML decimal/hex follows existing int64/uint64 bounds; never JS Number.
- WshcmApi.objects.patch({id,readToken,xml,dryRun?}); wshcm_patch_object. dryRun defaults false.
- bt-mode is the only new data control attribute; supported modes/contexts exactly as specified. Legacy default attribute is deferred to CLI integration.
- Existing create/replace are preserved. No CLI/runtime startup/compiler/.NET/dependency/publisher changes.
- Shared ObjectReadState: same queue, 32 snapshots, TTL30min; all handler attempts consume token including no-op/dryRun/errors.
- Recheck original XML/form/schema before Save and before successful no-op/preview; no external atomic CAS.
- No Save on no-op/dryRun; one Save maximum otherwise; preserve known id and writeStatus through every failure; no retries/rollback/cancellation.
- Native helper is pure apply, without IO/Save/BindToDb. Preserve current document context/external state.
- Native stand is the existing boristype-c-runtime-net9-wt-1 and postgres-1, localhost:80, demo user1/user1 via env, NODE_USE_ENV_PROXY=0. Start state was stopped and root started them for this task; root restores stopped state after final cleanup. Do not restart/reconfigure/install/alter user data or package schemes.
- Use own fixture names/IDs, exact cleanup and source hashes; test-only SQL cleanup is not part of this feature.

### Task 1: Shared SDK/native patch with complete core regression and native acceptance

**Files:** create `packages/ws-client/resources/object-patch.bs`, `packages/ws-client/test/object-patch.test.mjs`, `packages/ws-client/test/e2e/object-patch.mjs`; modify `packages/ws-client/src/hcm/objects.ts`, `object-xml.ts`, `schemas.ts`, `object-error.ts` if phases require, `packages/ws-client/package.json` scripts only. Create reproducible observation/probe sources and results under `refs/research/mcp/object-patch/`. Keep task report in the plan workspace.

**Interfaces:** consumes current WshcmEvaluator/ObjectReadState/inspectObjectXml. Produces `wshcmSchemas.objects.patch`, `WshcmObjects.patch`, `inspectObjectPatchXml(xml,{formUrl,id})`, and reusable `BtApplyObjectPatch(targetTopElem, sourceTopElem, nodes)` native helper. Parsed patch result has `root`, optional exact `id`, and bounded `nodes` with current validation metadata plus `name`, `parentIndex` (-1 for root), `ordinal` (same-name sibling index), and `mode` (`auto|merge|replace|replace-array|clear|remove`). Existing inspectObjectXml output remains compatible.

Patch result: `{id,formUrl,root,xml,changed:boolean,dryRun:boolean,writeStatus:'not_attempted'|'saved'}`. WshcmObjectError stays structured. Native request operation is `patch_object`, with `mode:'patch'`, selected form, original XML, nodes, expected snapshot and dryRun. Native apply receives typed source plus explicit-presence plan, groups repeated names per actual parent, and never copies control attributes.

- [ ] **Step 1: RED current projection and protocol tests.** Add executable resource tests with real shipped BS through VM platform doubles. Add public SDK tests via actual WshcmObjects with a fake evaluator only at transport boundary; expected schema validation, token handling, outcomes and exactly one dispatch. Include:

```js
test("same native date value skips Save despite distinct date instances", async () => {
  const before = await api.objects.get({ id });
  const result = await api.objects.patch({ id, readToken: before.readToken, xml: "<probe><stamp>2025-02-03T04:05:06Z</stamp></probe>" });
  assert.equal(result.changed, false);
  assert.equal(result.writeStatus, "not_attempted");
  assert.equal(platform.saveCount, 0);
});
```

The test helper api/id/platform must be defined by this task's actual executable BS fixture, not a mock of patch. Use typed resource-double XML data to model distinct date instances. Add structural-only arrays, keyed preservation/item replace/remove, unkeyed replacement, interleaved array isolation, malformed controls, duplicate/missing keys, dryRun/no-op consuming tokens and conflict/readback/transport regressions. Ensure user-visible expected XML and untouched sentinels, not only implementation counters.

Run `pnpm --filter @boristype/ws-client build`, then `node --test packages/ws-client/test/object-patch.test.mjs`; record expected RED before implementation.

- [ ] **Step 2: strict parser/schema.** Refactor only shared SAX machinery necessary to collect patch metadata without weakening ordinary XML validation. wshcmSchemas patch is strict and JSON Schema serializable. Prove full save still rejects bt-mode and new patch rejects unknown attributes/modes, invalid root/identity/path/cardinality/scalars, mixed text and input budgets. ParentIndex/ordinal distinguish repeated ancestors.

```ts
const patchInput = z.strictObject({ id: objectId, readToken: z.uuid(), xml: boundedXml, dryRun: z.boolean().default(false) });
```

- [ ] **Step 3: pure native apply and orchestration.** Group each parent's same-name MULTIPLE independently; match explicit primary keys by native canonical value/XML; preserve positions; handle per-item replace/remove, container replace/clear, unkeyed group replacement. Support replace-array on the first input MULTIPLE item, following same-name siblings without explicit modes, replacing only this group even directly under root; reject mixed modes. Include direct-root/interleaved keyed group replacement and repeat-no-op regression. Reject ambiguous or unsupported input before Save. Load source against actual form for typed values; apply only plan fields. Use stable before/after persistent XML for changed; IsChanged/Date identity are not proof. Keep actual existing document as candidate; recheck against independently reopened persistent original, then Save at most once. Skip Save for dryRun/no-op; preserve acknowledgement after failed readback. BuildScript embeds the pure helper for patch without breaking current operations.

- [ ] **Step 4: GREEN and complete native matrix.** Run focused/full SDK suites and build, targeted lint/format. Commit observation source/result with marker-rendering/hash verification; provide reproducible runner. Reuse initial reports in `/tmp/boristype-object-patch-{observe,file-observe}-result.json` only as historical observations, never relabel as product acceptance. Execute current helper on native temporary forms for all scalar/date/MULTIPLE cases and repeated idempotence. Execute actual API lifecycle on own DB fixtures, read back untouched fields, validate negative inputs and stale snapshots, demonstrate no Save for no-op/dryRun with meaningful counter/evidence. Register teardown before mutations. Record images/version, actual source hashes, fixture cleanup, temp files/evaluators and any unverified scope.

Run `WSHCM_USERNAME=user1 WSHCM_PASSWORD=user1 WSHCM_HOST=localhost WSHCM_PORT=80 NODE_USE_ENV_PROXY=0 pnpm --filter @boristype/ws-client test:e2e:object-patch` after adding that script. Never automatically retry an unknown native mutation. Keep stand running for Task2 and root cleanup. Commit SDK/native task after verification and self-review, then write report with commands/results/concerns for task reviewer.

### Task 2: MCP adapter, public docs, actual stdio acceptance and changeset

**Files:** modify `packages/mcp-server/src/tools/objects.ts`, `server.ts` guidance if needed, tests `objects.test.mjs`, `server.test.mjs`, `stdio.test.mjs`, and create `test/e2e/object-patch.mjs`; modify package scripts. Update SDK/MCP READMEs, `docs/guides/mcp-server.md`, `refs/mcp/{README,xml-objects,xml-object-patch}.md`, `refs/platform/object-model.md`, TODO only for concrete residual debt; add minor changeset for SDK/MCP. Preserve historical evidence. Save native receipt under `refs/research/mcp/object-patch/`.

**Interfaces:** consumes exact `api.objects.patch`, `wshcmSchemas.objects.patch`, and Patch result from Task1. Produces `wshcm_patch_object` as thin JSON adapter; total MCP tools is 27. No duplicated business/native/parser rules in MCP.

- [ ] **Step 1: RED registered tool tests.** Exercise actual createServer/listTools/callTool and shared SDK validation. Check input schema strictness/defaults/JSON Schema, no dispatch on invalid input, response/error mapping, old tools preserved and inventory27. Add stdout clean stdio coverage and failures with known identity/write status.

```js
const response = await client.callTool({
  name: "wshcm_patch_object",
  arguments: { id, readToken, xml: "<cost_center><name>new</name></cost_center>" },
});
assert.equal(JSON.parse(response.content[0].text).changed, true);
```

Use the repository's actual in-memory MCP client/SDK boundary harness; declare all fixture variables in test helpers. Run MCP build and focused objects tests to observe RED before registering tool.

- [ ] **Step 2: adapter and documentation.** Register shared patch schema with mutating/non-idempotent hints. JSON result/error retains all meaningful fields; bounded diagnostics don't discard saved acknowledgement. Add examples for simple field, keyed merge/item replace/remove, container replace/clear, unkeyed behavior, dryRun/token consumption and no-op. Explicitly distinguish candidate change, Save acknowledgement and hook-modified readback. Explain Date types and native IsChanged finding with exact evidence and links, not general claims. Document unsupported types/limits and pending CLI consumer; no new startup behavior or compiler unfrozen claim. Add minor changeset.

- [ ] **Step 3: actual CLI/stdio native verification.** Use existing stand and exact own fixtures only. Verify tool27, get→patch→readback, preserved unrelated fields, idempotent second patch, dryRun, invalid modes, conflict/token failure and exact cleanup. Bind receipt to current relevant SDK/resources/MCP source hashes. Reuse Task1 native helper tests rather than duplicating its full generic matrix in stdio.

- [ ] **Step 4: final task verification and commit.** SDK build before MCP build; run both package suites (may parallelize), targeted lint/format, `git diff --check`. Run docs checker and pack smoke sequentially; never docs checker concurrently with temporary pack smoke dirs. Full monorepo/compiler/native unrelated reruns are unnecessary. Review native receipts/source hashes/cleanup and write report with exact evidence limits. Commit and hand task diff to reviewer.

## Final acceptance

- [ ] Task reviews clean, then one broad full-feature review from d9ac6a2b5bd2e6a77cf9ac4c51aa981c203d8715; handle all final findings as one fix wave and one scoped re-review.
- [ ] Fresh root SDK/MCP builds/tests, docs integrity and pack smoke after code complete; no untouched compiler changes.
- [ ] Verify exact fixture/evaluator/file cleanup and original package schema baseline; restore originally stopped WT then PostgreSQL after all native work.
- [ ] Keep feature branch and commits reviewable. No push/merge/publish requested for this feature yet. Report native applicability, limitations and every recorded ruling with its cost.
