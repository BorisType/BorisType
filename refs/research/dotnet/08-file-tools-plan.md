> Исторический материал из `plans/dotnet/08-file-tools-plan.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# Managed file tools implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline in the current
> branch. Preserve user .agents/, do not push or publish remotely.

**Goal:** Четыре существующих MCP file tools через DLL и новый targeted edit.

**Architecture:** Thin BS resolver, standalone managed Files ABI, validated JSON
carrier, сохранение MCP success formats и новый edit/metadata contract.

**Tech Stack:** Existing .NET 9, xUnit, Node 24/TypeScript/Zod/MCP 2; no new deps.

**Spec:** [07-file-tools-design.md](07-file-tools-design.md).

## Global constraints

- DLL alpha.3 / API 1; standalone, no Datex callbacks, no overloaded ABI methods.
- Text bytes 1 MiB, JSON bytes 8 MiB, list 10000, edits 100; strict UTF-8/NUL policy.
- No implicit parents, links/junction traversal or recursive deletion.
- Same-directory replacement; best-effort external conflict check, no CAS promise.

## Task 1: Managed operations

Files: new FileContract.cs, FileIo.cs, Files.cs, FilesTests.cs; csproj/metadata.

- [x] Reflection ABI tests and actual filesystem fixtures, observe missing type RED.
- [x] Implement shared validation/bounds, read/write/list/delete with JSON errors.
- [x] Edit tests: unique/overlap, sequential all-or-nothing, BOM preservation,
      dryRun, no-op, expected hash, size/encoding/failure cleanup. Observe RED.
- [x] Implement edit and bounded atomic replacement; unit GREEN, build/pack.

## Task 2: MCP migration

Files: managed-files.ts/contracts, five tools, BS resources, server registration;
server/stdio/fixture tests; existing search unchanged.

- [x] Protocol/VM cases require actual DLL bridge for each operation and new edit;
      malformed JSON, errors, arguments/escaping, metadata, dryRun, annotations.
- [x] Observe RED, implement validated common bridge and five tool handlers.
- [x] MCP build/test and tarball smoke; six registered tools, five remaining stubs.

## Task 3: Native acceptance and finish

Files: e2e/files.test.mjs and search.mjs updated inventory, new edit e2e; package
READMEs/guides/ROADMAP/ADR, results report and plans index.

- [x] Install manifest-verified DLL on stopped local stand, start and smoke.
- [x] Existing file e2e + targeted edit e2e + search regression, sequential native
      calls and first-failure stop. Verify actual bytes and independent cleanup.
- [x] Restore initial stand running state; record versions, hashes, limits of evidence.
- [x] Review, managed/MCP/pack/format/lint/docs checks, local commits only.

Evidence: [09-file-tools-results.md](09-file-tools-results.md).
