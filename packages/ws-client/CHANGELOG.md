# @boristype/ws-client

## 0.1.0-alpha.9

### Minor Changes

- 84e6b68: Discover registered object types and catalog forms with `wshcm_list_object_types`, launch existing BorisScript server agents with `wshcm_run_agent`, and move one document to the HCM trash using `wshcm_delete_object` and a fresh full-read token.

  The type registry includes native document associations and configured custom-field summaries. An exact type lookup can also return field definitions grouped by their templates.

- 78ed795: Read and edit custom field and page definitions for a common object type or a template owner such as a specific request type. The SDK and MCP tools support upsert, explicit removal, moving fields and pages, and preview. Writes check the shared document revision and preserve settings outside the requested operations. Edit values on individual objects through the existing XML patch tool.

## 0.1.0-alpha.8

### Minor Changes

- fa02203: Add partial XML editing through `WshcmApi.objects.patch` and `wshcm_patch_object`. Edit selected fields on an existing object with a fresh full-read token, keyed array edits, explicit replacement and clear modes, and dry-run previews. Each handled attempt consumes its token. Equal candidates skip Save, and changed applies return the native readback. Errors retain the known ID and acknowledged Save status.
- 739b700: Start MCP when HCM is offline. Initialize, list and ping work immediately, and the next tool call can recover HCM access in the same stdio session. Active read tokens and package handles survive reconnects. Connection errors distinguish authentication, transport and preflight failures. A lost response leaves the outcome unknown and sends the business operation only once.

  The SDK adds typed HTTP request and dispatch errors, per-request deadlines, and owned evaluator probing and repair. Use `--connection-timeout-ms` to override the MCP preparation deadline of 5000 ms per HTTP request.

  Use `--package-artifact-directory` to select an absolute directory for local package ZIPs and metadata. The SDK exposes the same setting through the optional package options on `WshcmApi`. The default location stays `~/.boristype/package-artifacts`.

## 0.1.0-alpha.7

### Minor Changes

- 191595c: Добавлены `WshcmApi.execute({code})` и MCP tool `wshcm_execute` для серверного BorisScript: возвращаемое значение, сообщения `print(value)` и native ошибки с сохранением вывода. Transport/response failures отмечают неизвестный исход без автоматического retry; timeout клиента не останавливает серверный код. XML/date/typed values используют общую проекцию с XQuery. DLL не требуется; штатные alert/логи не перехватываются.

  `print(value)` оставлен экспериментальным кандидатом: практическую полезность ещё предстоит оценить, после чего функция может быть изменена или удалена.

- 191595c: Add native object package workflows: explicitly addressed saved schemas, direct-ID or schema ZIP export, persistent local artifacts, immutable inspection and selected import, and durable operation receipts. The MCP server exposes ten matching package tools with bounded text and pagination. Exact IDs remain decimal strings; imports recheck conflicts, require explicit extras/version/reimport flags, and never retry automatically after timeout. Native acceptance currently covers objects on Linux C/PostgreSQL; additional package types and dependency resolvers remain limited.
- 191595c: Добавлены `WshcmApi.systemInfo()` и MCP tool `wshcm_get_system_info`: сводка версий и настроек стенда, а с `includeReport: true` — полный штатный текст системного отчёта без дополнительной очистки. DLL не требуется; отчёты больше 256 KiB UTF-8 отклоняются целиком. Формализованный JSON подробных конфигураций оставлен в TODO.

## 0.1.0-alpha.6

### Minor Changes

- 0264f3a: BREAKING: decode every SOAP integer as bigint and encode every JavaScript number
  as real. Use bigint arguments for signed int64, including small integer values.
  Preserve null/undefined and recursively support ordinary records and repeated-e
  arrays. Reject invalid ranges, unsupported objects and malformed typed/XML values.
  Native negative integer requests use unsigned decimal int64 bits.

  Add Evaluator.xquery and executeXQuery with server-side typed XML projection,
  bounded whole-row results, ISO date strings and CR/LF-safe string transport.
  WshcmApi.xquery now returns the same typed XQueryResult instead of raw JSON text.
  MCP now uses this adapter: safe bigint become JSON numbers, larger bigint exact
  decimal strings, and nonfinite real cause an explicit error. Remove the old
  MCP-only object_to_text query bridge. Document real serializer precision loss
  and SQL-to-XML limitations; query execution remains unrestricted and has no retries.

## 0.1.0-alpha.5

### Minor Changes

- 1580cd3: Move platform operations and read grants into the reusable WshcmApi SDK. Bundle
  production .NET dependencies with ws-client and prepare them automatically for
  file operations, without separate DLL downloads. Verify installed bytes and
  actual loaded MVID, preserve newer compatible runtimes, and report
  restart_required when a cached assembly needs a normal HCM restart. Add
  wshcm_runtime_status and structured runtime diagnostics; XML/XQuery remain
  independent of DLL readiness. Building ws-client from source now requires the
  repository .NET SDK; registry installs use the bundled artifacts.

## 0.1.0-alpha.4

### Patch Changes

- Publish the coordinated alpha package set through per-package GitHub Actions
  trusted publishers, retaining independent versions and the existing CLI/runtime/
  ESLint fixed group. Include the accumulated compiler, CLI and transport changes
  prepared in the preceding release checkpoint. Exclude compiled ESLint tests from
  the npm archive and include the runtime README with its deployment and memory
  limitations. Runtime behavior is unchanged by this release preparation.

## 0.1.0-alpha.3

### Patch Changes

- Include the native XML form/object tools in the first public MCP release:
  load an expanded XMD form, read complete object XML with a readToken, and create
  or replace an object using XML with partial validation and stale-read protection.
  Preserve exact decimal IDs; platform Save/hooks can partially persist changes.
  The nine physical filesystem tools require the separate FileSystem DLL API 2;
  XQuery and XML object tools use their packaged BorisScript bridges without it.

  Read CLI and MCP initialization versions from the installed package manifest so
  Changesets version bumps are reflected in both public entry points. Include a
  ws-client README describing its exports, evaluator lifecycle and transport limits.

- fd1d248: Add nine physical filesystem tools over stdio and authenticated HCM SOAP:
  read, write, edit, list, search, delete, create-directory, move and get-info.
  All require the separately installed BorisType.FileSystem **0.1.0-alpha.4 / API 2**;
  the npm package does not include the DLL. SQL-backed URL resources are outside
  this physical filesystem contract.

  This changes the prototype API: read always returns JSON with original-byte
  SHA256, BOM, UTF-16 range coordinates and a per-server readToken. Edit requires
  coverage of each replacement; overwrite requires full coverage. Write defaults
  to create-only. Text IO uses strict UTF-8 and a 1 MiB limit; search reports its
  budgets and incomplete coverage. Move never overwrites or falls back to copy/delete.

  Use stable MCP SDK v2 split packages and Zod 4 schemas. Package the two active BS
  bridges, remove unimplemented tools and stale build output, and clean up the
  temporary evaluator on stdio EOF and signals. Add protocol, real-filesystem,
  tarball and opt-in native HCM tests; the DLL ZIP has a verified file manifest.

  Preserve SOAP string whitespace, CR/LF and numeric-looking text while retaining
  explicit VALUE-TYPE conversion. Update fast-xml-parser to ^5.11.2 in ws-client
  and bt-cli, and align development types with @types/node ^24.19.2.

- 07b6cc2: Add `wshcm_xquery` through the existing server-side evaluator, including the `sql:`
  prefix, without requiring a BorisType DLL. Pass query text unchanged and return
  bounded platform JSON with row counts and truncation metadata, without automatic
  retries or Node numeric re-serialization. Document that queries may modify data
  and that output limits and transport timeouts do not guarantee bounded database
  work, cancellation, rollback or lossless platform type conversion.

  Decode HTTP response UTF-8 as a stream so multibyte characters split across
  network chunks survive SOAP parsing. Add a local HTTP regression and native
  large Unicode query acceptance on the existing HCM stand.

  Send cross-tool usage instructions during MCP initialization, including
  read-aware file workflows, physical storage boundaries and query result limits.
  Add an optional installable `boristype-mcp` skill with file and query references.
