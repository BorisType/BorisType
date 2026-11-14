# Shared HCM API and managed runtime implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for scoped implementation/review; continue tasks without intermediate permission prompts. Steps use checkbox syntax.

**Goal:** Make ws-client the reusable HCM SDK and automatically deliver, install and identify the managed dependencies required by its filesystem API.

**Architecture:** Extract existing platform operations/state from MCP into an evaluator-backed WshcmApi. Bundle production assemblies with a validated manifest; bootstrap installation through platform primitives and a standalone managed installer. Keep MCP as schemas/output/status adapters, with unchanged existing tool semantics.

**Tech Stack:** Node 24.22.2 baseline, TypeScript 6.0.3, existing Zod/saxes, .NET 9 with repository SDK pin, native HCM SOAP evaluator.

**Spec:** [design.md](design.md)

## Global constraints

- Work only in `/home/agent/.codex/worktrees/182e/BorisType`, branch `feat/ws-client-managed-runtime`; the original checkout belongs to another session.
- No compiler script/module changes; no npm publication, main push, server restart, global config edits or replacement of working stand DLLs.
- Assets are installed automatically; the SDK has no MCP dependency or console/process lifecycle side effects.
- Preserve exact object IDs, XML-first semantics, original XQuery JSON numeric tokens, existing read-grant limits and unknown mutation outcomes.
- Distinguish package expectations, installed bytes/MVID and the assembly loaded by the answering process.
- Use immutable managed install paths, validate both hashes and identity, serialize concurrent installation, avoid downgrade and stale-code success.
- Do not claim Windows HCM, cluster-wide readiness or cancellation from local/managed tests.

### Task 1: Extract reusable platform API and thin MCP adapters

**Files:** `packages/ws-client/src/hcm/**`, `packages/ws-client/resources/**`, `packages/ws-client/src/index.ts`, `packages/ws-client/package.json`, `packages/ws-client/test/**`; `packages/mcp-server/src/tools/**`, server/connection, tests/resources/package manifest; lockfile.

**Interfaces:** `WshcmApi(evaluator: {eval(code: string): Promise<unknown>})`; `files.read/write/edit/list/delete/mkdir/move/info/search(input)`; `objects.getForm/get/save(input)`; `xquery(input): Promise<string>`. Export shared input schemas as `wshcmSchemas`. Preserve structured object error details. Evaluator ownership remains external.

- [ ] Write a direct SDK regression that requires full read before overwrite and rejects a token from another API instance. Run against the old exports and observe failure because WshcmApi does not exist.
- [ ] Extract existing template renderer, file schemas/read grants, object parser/state and operations into SDK modules. Implement all public methods with input validation and typed results; keep lossless query JSON as text.
- [ ] Move platform BS resources and corresponding non-MCP regressions to ws-client. Add existing Zod/saxes versions there; keep tests out of published build.
- [ ] Replace tool bodies with SDK calls and formatting. Existing 13 names, schemas, descriptions, annotations and result shapes remain compatible. Delete redundant platform implementation files/resources from MCP.
- [ ] Run SDK and MCP builds/tests, including protocol/stdio tests and direct SDK negatives; inspect diff and commit this task without altering runtime delivery files owned by Task 2.

### Task 2: Pure-managed installer, identity and bundled assets

**Files:** new `packages/dotnet/src/BorisType.RuntimeBootstrap/**`, corresponding managed tests and solution entry; `LibraryInfo.cs`; `packages/dotnet/tools/**`; new `packages/ws-client/tools/**` and `resources/dotnet/**` generated output; publish workflow/tools only where needed for actual npm packing.

**Interfaces:** String ABI takes a physical owned root and bounded JSON descriptor; returns expected/installed/loaded build identity and `ready|restart_required|blocked`, with reason. Bundle descriptor records assembly simple name, version, API, MVID, bytes, SHA256 and exact package-relative paths.

- [ ] Add failing managed tests using actual temporary files: corrupt payload must not publish an active file; parallel matching installation remains consistent; loaded older module reports restart_required; matching version with changed MVID is a conflict; newer compatible runtime is not downgraded.
- [ ] Implement bounded immutable staging, traversal/symlink rejection, cross-process serialization, SHA256/MVID verification and reflection of loaded assemblies in the relevant ALC. Never identify loaded code by rereading Assembly.Location.
- [ ] Build bootstrap under a content-specific simple assembly name so its own loader cache cannot silently select another build; write manifest from actual PE metadata using a build-time .NET utility.
- [ ] Pack only production binaries/necessary dependency metadata and manifest into ws-client resources. Build/pack tests must open the real archive and verify bytes/MVID, not grep manifest source.
- [ ] Update release packaging to build these assets automatically with the pinned SDK. A registry consumer needs Node and HCM, not a local .NET SDK or separate download.

### Task 3: Automatic SDK runtime preparation and MCP diagnostics

**Files:** `packages/ws-client/src/hcm/runtime/**`, bootstrap BS resources, WshcmApi integration, tests; `packages/mcp-server/src/server.ts` and runtime status tool/tests.

**Interfaces:** `api.runtime.ensure(): Promise<RuntimeStatus>`; `api.runtime.requireReady(): Promise<RuntimeStatus>` throws a typed error containing status when unavailable. Files call requireReady automatically; XQuery and objects do not. RuntimeStatus reports expected, installed and loaded identity separately.

- [ ] Add failing transport-boundary tests: fresh installation, current installation, old loaded module, corrupt/missing bundle, failed upload, incompatible API, retry after process change, and concurrent ensure calls.
- [ ] Bootstrap the content-specific helper using BS primitives before any attempt to load an absent component. Upload immutable staged bytes; verify actual server contents before loading. Validate every server response and preserve unknown transport outcomes.
- [ ] Integrate preparation into file calls; expose current status to MCP clients as structured data, including restart_required. Preserve availability of DLL-independent tools.
- [ ] Run real protocol calls proving that stale runtime blocks file operation with actionable status while XQuery remains usable, and that a later matching loaded identity clears the requirement.

### Task 4: Native acceptance, package validation and documentation

**Files:** `refs/research/ws-client-runtime/**`, SDK/MCP/.NET READMEs, current refs/guides, changeset, bounded native probe and package tests.

- [ ] Run bounded Linux native install/load/cache probes with uniquely named fixture components, correct source/artifact hashes and independent cleanup. Do not overwrite the stand's working FileSystem DLL or restart its process.
- [ ] Verify actual packed ws-client and installed MCP resolve bundled resources and execute protocol tests through the shared SDK; native operations must use this path.
- [ ] Run relevant .NET/SDK/MCP tests, lint/typecheck/format, docs checks and npm pack inspection. Request independent review of loader/cache/concurrency and public API behavior; address findings and rerun affected checks.
- [ ] Document automatic setup, status/restart semantics, identity/permissions/OS boundaries and remaining acceptance gaps. Record implementation decisions/evidence and mark the completed tasks here.
