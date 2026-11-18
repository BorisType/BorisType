# Resilient MCP Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep MCP usable with HCM offline and restore backend access on the next requested operation without replaying business code.

**Architecture:** Stable SDK/API/evaluator facade owns lazy single-flight backend setup and safe module probes. Typed SDK failures retain dispatch knowledge and causes; existing tool formatters add bounded connection diagnostics while keeping mutation acknowledgements. Native proxy tests verify current built CLI independently of HCM process restart.

**Tech Stack:** Existing Node/pnpm pins, TypeScript, SDK v2 stdio, Node HTTP test servers, existing Linux C Docker stand. No new dependencies.

**Spec:** [refs/mcp/resilient-connection.md](../../mcp/resilient-connection.md).

## Global Constraints

- Baseline fa022038b8cfd840d1cea82cbd2e1a81dcf7af1d, dedicated feat/mcp-resilient-connection; preserve unrelated code and native evidence.
- MCP initialize/tools/list/ping perform zero HCM requests; inventory27; no background polling or new tool.
- One WshcmApi/stable evaluator facade per MCP lifetime; preserve read grants, package handles and operation IDs across transport recovery; pure filesystem artifact-store operations stay available offline. Existing inspectPackage native preview/context still requires HCM.
- Setup/probe timeout5000ms per HTTP request, ordinary request30000ms unchanged; optional connectionTimeoutMs/--connection-timeout-ms strictly positive integer.
- One shared setup promise, clear it after failure; at most one repair/probe of owned evaluator before user dispatch. Safe probe return1, user BS dispatched at most once.
- Pre-dispatch single-operation outcomes not_started/not_attempted; after dispatch unknown without replay. Preserve saved/knownIDs/multi-step receipts and native business errors.
- Distinguish auth401/403, network/timeout and non-SOAP HTTP failure; preserve SOAP Fault behavior, including HTTP500 Fault. No secret/header/cookie/body leakage.
- Eager connection API and external createServer use remain compatible. Idempotent bounded shutdown, partial setup ownership, no server cancellation claim.
- No CLI object sync/startup/compiler/.NET/release/version/dependency changes; installer is research only until separately approved.
- Stand initially stopped, localhost80 demo user1/user1 env NODE_USE_ENV_PROXY=0; root starts PG→WT and later stops WT→PG. No mid-test platform restart/reconfigure/install or user/package edits. Proxy toggles simulate outage; only own helper/fixtures, exact cleanup, no SQL fallback.

### Task 1: Shared failure/timeout support and resilient MCP lifecycle with complete local tests

**Files:** SDK `src/{client,evaluator,exceptions,types,index}.ts`, `src/soap-utils.ts` only if needed for typed Fault preservation; dispatch marker/cause plumbing in `src/hcm/{types,objects,object-error,execute}.ts`, `runtime/{runtime,contracts}.ts`, `packages/{service,contracts}.ts` only where failures are wrapped. Existing SDK HTTP/evaluator/outcome tests. MCP create `src/connection-manager.ts` and `src/connection-error.ts`; modify `connection.ts`, `server.ts`, `types.ts`, `cli.ts`, error helpers in `tools/{result,objects,packages,execute}.ts` as required; add manager tests and real CLI/stdio scripted HTTP tests. Keep each file focused; no duplicated business operations.

- [ ] Establish baseline SDK362/MCP216 tests. Add RED local HTTP tests for error category/timeout and preserving HTTP500 SOAP Fault. Define dispatch-aware evaluator error marker and preserve causes through existing wrappers, with focused known-outcome tests. Do not derive lifecycle decisions from text matching.
- [ ] Implement typed transport diagnostics and per-request timeout options. Preserve default request timeout and existing successful SOAP values. Force evaluator setup reuses its owned URL; track attempted setup for cleanup. SDK generic failures remain conservative.
- [ ] Add RED real registered MCP/CLI tests: initialize/list27/ping with upstream absent, no HCM network before tools, first offline failure, same MCP process recovers, concurrent calls share setup, safe module repair, repeated outages, auth/native errors, no replay after dispatch, shutdown before/during setup. Use local owned HTTP fixtures; assert business counters/XML and stream cleanliness, not only internal state.
- [ ] Implement lazy connection manager and stable evaluator, maintain one SDK API and local artifact state. Integrate bounded structured errors without dropping legacy identity/phase/writeStatus/operation data. Require a safe probe before each actual evaluator dispatch; coalesce concurrent preparations, never replay user code. Keep eager APIs compatible. Add CLI timeout option; validate config early. Ensure offline-first close is clean and partial setup is owned.
- [ ] SDK→MCP builds, focused then both complete suites once, changed-code lint/format/diff-check. Self-review, commit, write task-1-report.md with exact RED/GREEN output/commands/limits. No native calls; root coordinates Task2. Independent task review before Task2.

### Task 2: Current-source native recovery acceptance, docs and changeset

**Files:** create `packages/mcp-server/test/e2e/connection-recovery.mjs` and minimal owned proxy helper if needed, package script; save source/build/eval/cleanup receipt and reproduction guide under `refs/research/mcp/connection-recovery/`. Update SDK/MCP READMEs, public MCP guide, `refs/mcp/{README,transport-and-lifecycle,resilient-connection}.md`, TODO only real residuals; minor changeset SDK/MCP. No Task1 production rewrite unless controller assigns a review fix.

- [ ] Build SDK→MCP and run actual CLI/stdio with proxy offline: initialize/list27/ping work, first business call clearly fails. Enable proxy, same MCP session succeeds; cycle outage again. Verify auth classification, restore one deleted owned evaluator before operation dispatch, untouched fields/grants/local package handle continuity and one mutation only despite response loss. Do not restart the platform to simulate availability.
- [ ] Register teardown before all mutations. Preserve evaluator inventory and existing package schema XML; exact owned records/files/helpers cleaned, receipt binds current relevant source/build and actual observed identity. Start/stop containers belongs root. Report unsupported native restart/runtime/OS scopes honestly, retain original unrelated probe receipts.
- [ ] Document offline tool errors, recovery on next call, timeout distinctions, no background poll, mutation uncertainty and cleanup. Installer research stays separate, with verified official registration commands if possible; do not write host/client configs or implement install without separate approval.
- [ ] Final local builds/suites, applicable lint/format, docs checker after all suites/temp pack dirs disappear, then tarball smoke sequentially. Commit and task-2-report.md with native/cleanup/hash evidence. Independent task review.

## Final acceptance

- [ ] Task gates clean, then one whole-feature review from fa02203, one consolidated final fix wave and one scoped re-review if needed.
- [ ] Fresh root SDK/MCP checks and current source/build receipts; exact cleanup; restore initially stopped stand WT→PG.
- [ ] Preserve feature branch, no automatic merge/publish. Collect every ledger Ruling with its cost before deleting only this plan's ignored scratch directory.
