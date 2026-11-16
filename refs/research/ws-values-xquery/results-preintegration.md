# SOAP values / typed XQuery: verification before integration, 2026-11-16

Это acceptance исходной реализации до интеграции с новым shared SDK;
текущий выпуск отслеживается в [integration-release](integration-release.md).

Issues #66–69; implementation on `fix/ws-client-values-xquery` from
`5f16793453e159d5f51e9cf7eee739cdc1ecf251`. Approved contract:
[spec](design.md).
Public [matrix and sources](../../../docs/reference/ws-client-values.md),
[decision](../../decisions/2026-11-16-ws-values-xquery.md).

## Environment and evidence boundaries

Node 24.22.2 / pnpm 12.16.1. Existing local Linux C HCM 2025.2.1333,
PostgreSQL 16, image `websoft/hcm:2025.2.1333`, image ID
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`.
File regression path uses existing CLR 9.0.11 / BorisType.FileSystem alpha.4 API 2,
installed DLL SHA256 `ca397f4c45213a40a02f73861ef0f59f128efd12a8b7e50445ecfc8dc6d042a8`.
Query and SOAP value paths require no BorisType DLL. No hcm-guru used.

Tests below distinguish Node doubles from native C execution. The native runners
are included as source and require an explicitly selected existing test stand;
they do not deploy HCM or write business records. XML/schema cases use owned
in-memory documents. No native failure was retried automatically.

## Results

| Check                                                          | Result                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| Workspace `pnpm exec turbo run build`                          | 15/15 tasks successful                                  |
| ws-client Node tests                                           | 82/82                                                   |
| MCP Node tests                                                 | 152/152                                                 |
| CI unit selection (bt-ir, eslint-plugin, ws-client, MCP)       | Passed; bt-ir 61/61, eslint-plugin suites passed        |
| Native SOAP values                                             | 6 subcases + parent = 7/7                               |
| Native reusable XQuery adapter                                 | 11/11 explicit assertions, runner passed                |
| Native MCP XQuery via CLI/stdio/SOAP                           | 11 subcases + parent = 12/12                            |
| Native MCP file regression                                     | 28/28 + edit 1/1 + read-aware 1/1 + search 1/1          |
| MCP tarball smoke                                              | Resources, imports, CLI help/version passed             |
| ws-client tarball smoke                                        | Public exports/import and bundled query resource passed |
| `pnpm lint`                                                    | 0 errors; 11 existing unused-variable warnings in bt-ir |
| `pnpm format:check`, `pnpm check-versions`, `git diff --check` | Passed                                                  |
| `pnpm docs:build`                                              | Passed                                                  |
| Independent whole-change review                                | No remaining material findings                          |

Native SOAP tests cover exact int64 extrema, small/big positive and negative
integers, repeat input of returned values, whole/fractional real, -0/nonfinite,
null/undefined, booleans, strings, nested records and mixed/empty/singleton arrays.
Raw native date/XML produce explicit unsupported-value errors. The real formatting
regression intentionally records observed precision loss instead of claiming exact
binary64 round trips.

Native query tests execute the shipped BS template. They cover SQL/catalog types,
CR/LF/Unicode query text and values, nested XML, empty scalar/complex fields,
repeated siblings, schema singleton multiple fields, dates, native records/arrays,
row lookahead, output bounds and finite depth/value rejections. MCP additionally
checks exact big-ID decimal strings, safe JSON numbers, unusual aliases including
`__proto__` and spaces, NaN presentation errors, SQL errors and no retries.

Each native runner confirmed deletion of its temporary module/evaluator. File and
MCP suites also inspected the evaluator delta independently. Final physical check
found no `soap_values_*` fixture. Existing live MCP sessions were retained.

The first SOAP review found that fast-xml-parser discarded invalid XML numeric
character references (`1&#0;2` became `12n`). Explicit XML 1.0 codepoint/reference
validation was added with RED/GREEN regressions; original reproducers now throw.
The updated MCP skill reference passed a retrieval/application check covering
JSON big IDs, real precision, SQL -7 loss and direct ws-client bigint input.

## Reproduce

From the repository root after installing the pinned toolchain/dependencies:

```sh
pnpm exec turbo run build
pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin --filter @boristype/ws-client --filter @boristype/mcp-server test
pnpm --filter @boristype/mcp-server test:pack
pnpm lint
pnpm format:check
pnpm check-versions
pnpm docs:build
```

For ws-client native tests, set `WSHCM_HOST`, `WSHCM_USERNAME`, `WSHCM_PASSWORD`
and optionally `WSHCM_PORT`/`WSHCM_HTTPS`; then run:

```sh
pnpm --filter @boristype/ws-client test:e2e:values
pnpm --filter @boristype/ws-client test:e2e:xquery
```

For MCP native tests select the local container with `WSHCM_E2E_CONTAINER` and
set `WSHCM_E2E_USERNAME`/`WSHCM_E2E_PASSWORD`. Run sequentially on an exclusive stand:

```sh
pnpm --filter @boristype/mcp-server test:e2e:xquery
pnpm --filter @boristype/mcp-server test:e2e
pnpm --filter @boristype/mcp-server test:e2e:edit
pnpm --filter @boristype/mcp-server test:e2e:read-aware
pnpm --filter @boristype/mcp-server test:e2e:search
```

## Remaining platform limits

Real serialization precision, SQL-to-XML negative-integer/NULL losses, database
work and timeout/cancellation guarantees remain as described in the public matrix.
Windows/MSSQL and other HCM versions were not exercised. Arbitrary XML emulation,
XML attributes/mixed text, object identity and exact-real custom transport are
outside this change. This work does not address compiler issues #28–30.
