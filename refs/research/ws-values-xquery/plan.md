# Symmetric SOAP values and XQuery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Fix issues #66–69 and provide reusable typed XQuery results to MCP.

**Architecture:** SOAP uses bigint for all int64 values and number for all real
values. A ws-client-owned server query projection returns ordinary typed data;
MCP is a bounded JSON presentation adapter.

**Tech Stack:** Node.js 24.22.2, pnpm 12.16.1, TypeScript, fast-xml-parser,
node:test, BorisScript on Linux C-runtime HCM 2025.2.1333.

**Spec:** `refs/research/ws-values-xquery/design.md`

## Global constraints

- No compiler changes, new DLLs or hcm-guru.
- Preserve null/undefined and integer/real types recursively; reject unsupported
  values. Real serialization precision is a known server limitation.
- Tests distinguish Node doubles from actual C execution. Check evaluator cleanup.
- The clone is isolated; use branch `fix/ws-client-values-xquery`.

## Task 1: SOAP codec

Files: `packages/ws-client/src/soap-utils.ts`, `src/types.ts`, `src/index.ts`,
`test/soap-utils.test.mjs`, `test/client.test.mjs`.

Produces: recursive `WshcmValue`, unchanged renderRequest/parseResponse exports,
bigint decoding and typed recursive request encoding.

- [x] Write regressions for actual repeated e arrays, null, signed/hex int64,
      `42n` vs `42`, negative-zero/nonfinite real, nested data, invalid inputs.
      Core assertion: `parseResponse(response('<Result VALUE-TYPE="integer">0xFFDFFFFFFFFFFFFF</Result>')) === -9007199254740993n`.
- [x] Run ws-client tests and confirm failures reflect the old codec.
- [x] Implement exact int64 parsing/encoding, recursive arrays/records and strict
      type errors; preserve existing string escaping and SOAP faults.
- [x] Build ws-client and run its tests. Review the codec against the spec.

## Task 2: Reusable XQuery

Files: new `packages/ws-client/src/xquery.ts`, `resources/xquery.bs`,
`test/xquery.test.mjs`; `src/evaluator.ts`, `src/index.ts`, `src/types.ts`.

Consumes: Task 1 values. Produces: Evaluator.xquery(query, {maxRows?}) returning
`{rows, returnedRows, truncated, limitReason}` with numeric JS metadata counts.

- [x] Probe native XML child traversal and scalar types on finite owned or
      bounded data, including repeated elements and date fields.
- [x] Write failing adapter tests for typed rows, query escaping, empty/limited
      results, escaped strings, malformed carriers and errors without retries.
      Core assertion: rows contain `{id: 9007199254740993n, score: 1}`.
- [x] Implement the BS typed projection and adapter, including bounds and
      JSON-string leaf protection. Native tests must cover the actual BS template.
- [x] Run unit tests and a bounded actual C query series, including catalog and
      SQL rows, Unicode/CRLF, nested XML and cleanup.

## Task 3: MCP integration and documentation

Files: `packages/mcp-server/src/tools/xquery.ts`, query unit/E2E tests,
remove superseded `resources/xquery.bs`; ws-client/MCP README, docs/reference,
`ref/decisions`, `ROADMAP.md`, `.changeset`.

Consumes: Evaluator.xquery. Produces: the existing MCP tool using the common
adapter and explicit bigint JSON presentation.

- [x] Replace the query test double at the reusable adapter boundary and add a
      failing bigint/nonfinite presentation regression; observe failure.
- [x] Implement MCP delegation, preserve limits/errors, remove old query bridge.
- [x] Document the API, break from number integers to bigint, JSON presentation,
      unsupported XML/dates and known real/SQL limitations; add release notes.
- [x] Build workspace; run CI unit/package checks, lint, format and dependency
      checks. Run native ws-client and MCP XQuery/file regression suites.
- [x] Obtain a whole-change code review; fix material findings and repeat only
      checks affected by fixes. Record verification and remaining platform limits.

Verification and runtime scope: [results](results-preintegration.md).
