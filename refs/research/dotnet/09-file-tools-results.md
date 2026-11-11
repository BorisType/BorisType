> Датированное техническое evidence; текущие основания — [тематическая запись](../../dotnet/files-and-read-grants.md).
> Alpha.3/API1, optional metadata/hash и unconditional overwrite ниже superseded read-aware alpha.4/API2. Byte/edit evidence остаётся датированным.

# Managed file tools: implementation and native evidence

Дата: 2026-11-06. Branch: feat/mcp-server.

## Delivered contract

DLL 0.1.0-alpha.3 / API 1, capabilities search/files/edit. Existing search ABI
сохранён. Новый Files API: ReadJson, WriteJson, ListJson, DeleteJson, EditJson;
каждый `(physicalPath, requestJson) -> JSON string`, unique reflection name.
BS только разрешает URL и вызывает DLL; Datex dependencies/callbacks отсутствуют.

Все шесть tools зарегистрированы. Прежние default success formats сохранены;
read includeMetadata возвращает SHA256 исходных bytes и BOM. Edit предоставляет
exact sequential patches, preview, original-byte hash precondition и explicit
ambiguity/missing/conflict errors. Подробности: [spec](../../dotnet/files-and-read-grants.md).

Миграция намеренно уточняет contract: strict UTF-8/NUL policy, 1 MiB file/output,
8 MiB JSON, list 10000, edits 100, no implicit parents, no link paths, no directory
deletion. File root для listing — error. Write добавляет BOM; edit сохраняет его.
Same-directory rename и best-effort external conflict checking не обещают CAS,
ownership/ACL preservation, hardlink/inode identity или race-proof sandbox.

## Managed and adapter checks

- .NET 83/83: actual temporary filesystem, reflection string ABI, exact bytes,
  UTF-8/BOM/newlines, known SHA256, binary/invalid/large read, write/overwrite,
  readonly/parent/link policies, Unix rwx, sorted immediate listing/overflow, delete,
  sequential/overlapping edits, rollback, preview/no-op/hash/size validation,
  BOM-inclusive byte boundary and aggregate JSON budget before IO.
- MCP 95/95: actual MCP InMemoryTransport, real BS template in VM with only
  platform/CLR boundary doubled, six tools, escaping/options/metadata, versioned
  response/error validation, missing DLL and invalid input before evaluator.
- RED before production: missing Files type in reflection tests and 42 failing
  protocol expectations for the managed migration/edit registration.
- Review finding reproduced RED: expectedSha256:null disabled the precondition
  in direct DLL requests. Top-level null fields are now rejected before deserialize
  or mutation; regression confirms unchanged bytes. Re-review: no important findings.

VM tests do not establish native behavior. Native checks below are independent.

## Native Linux HCM: PASS

Existing stopped local stand, no deployment/recreation. ZIP manifest/hashes
verified; alpha.2 files backed up outside git; alpha.3 installed before startup.
Metadata probe confirmed exact version/API/capabilities, auth and SOAP arithmetic.

Runtime: Linux amd64 / Ubuntu 24.04.3, HCM image websoft/hcm:2025.2.1333,
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
Current startup log 17:53:39 UTC confirms CLR 9.0.11, managed assembly
2.25.12.4 [202512041524]. Carrier: CLI → stdio MCP → SOAP evaluator temporary
library → C BorisScript → DotNetCoreHost → standalone DLL.

| Command           | Actual result                                                            |
| ----------------- | ------------------------------------------------------------------------ |
| `test:e2e`        | 28/28 PASS, 0 skipped; original read/write/list/delete cases through DLL |
| `test:e2e:edit`   | 1/1 PASS, 0 skipped; independent bytes/hash/cleanup checks               |
| `test:e2e:search` | 1/1 PASS, 0 skipped; prior names/content/regex/escaping regression       |

Original file cases include Unicode, whitespace, CR/LF/CRLF, empty text,
create/overwrite with BOM, quoted/template-like names/content, listing/deletion,
errors and evaluator cleanup after EOF/SIGTERM/SIGINT. File bytes independently
compared through Docker; no platform API double used.

Edit cases: files with/without BOM, Unicode/quoted/template-like paths, metadata
SHA256 checked against actual bytes, dryRun unchanged bytes, sequential commit,
stale expected hash refusal, overlapping matches, missing second patch without
partial commit, NUL/invalid UTF-8 errors, link deletion refusal and marked listing.
No temporary sibling debris. Each case uses fixed expected text/bytes.

All calls executed sequentially; no failure/timeout/retry. Post-test independent
find found no unsafe_eval__.bs or mcp-e2e-_ in wt root. HCM stayed running with
OOMKilled=false. Both containers then stopped intentionally to restore initial
state; installed alpha.3 remains available for future starts. Hot replacement
was not tested. Known unsafe Datex callback probe was not run.

SHA256 evidence:

- Installed DLL: `6ce57ab04dd74d5ddaf28a38532cd8d707bfa8361868f8912383496844fb21af`.
- File-operation BS template: `902af0906b9fa812042200bb54c4bcb364d8fce9eb5a7038b62fba272b405d47`.
- Search BS template: `2ed634fb0b958262f3c169929e7d033273f4a859578b5719eca7615971e36275`.
- Metadata original/evaluated source (no adaptation): `3d13ef7f8ac6f3ce23970326d1276387c1d87da0d0e36433600c6190c2f5cb7a`.

Raw logs, install manifest, previous artifacts and metadata probe are outside git:
`/home/agent/workspace/wshcm-stand-net9/research/file-tools-native-j6mkrwdu/`.
No vendor assemblies or credentials are added to the repository.

## Limits of evidence

Windows and other HCM versions remain untested natively. Existing .NET CI matrix
must run its managed/pack checks independently on Windows. Full permissions,
special files/VFS, interrupted IO and cross-process race semantics remain outside
this bounded acceptance. Per-call elapsed times are not a benchmark.

## Final packaging and repository verification

| Check                             | Result                                                 |
| --------------------------------- | ------------------------------------------------------ |
| .NET Release build                | 0 warnings/errors                                      |
| .NET installation ZIP integration | 1/1, hashes and exact production files verified        |
| MCP npm tarball smoke             | Resources, imports, CLI help/version pass              |
| Default Turbo build               | 15/15 tasks; .NET remains separate                     |
| ws-client tests                   | 19/19                                                  |
| Root botest                       | 149/149, 17 suites                                     |
| Prettier, syncpack, docs build    | Exit 0                                                 |
| ESLint                            | 0 errors / 33 pre-existing warnings in remaining stubs |

Local commits only. User .agents/ and generated/vendor artifacts are excluded.
