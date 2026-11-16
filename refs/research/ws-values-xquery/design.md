# Symmetric SOAP values and XQuery data

Approved in the implementation discussion on 2026-11-16 (issues #66–69).

## Contract

- Every SOAP integer is a JavaScript bigint, including small integers. Accept
  only signed int64 values; decode 64-bit hexadecimal two's-complement results.
  Encode negative integers as unsigned decimal representations of the same bits,
  as verified on Linux C-runtime HCM 2025.2.1333.
- Every JavaScript number is a SOAP real, including whole-valued numbers.
  Preserve negative zero and recognize native nan/inf/-inf tokens. Standard HCM
  SOAP real serialization loses precision; this is an accepted, documented
  platform limitation, not repaired by this change.
- Preserve string, boolean, null and undefined separately. Recursively support
  ordinary records and arrays, using repeated e elements for SOAP arrays.
- Reject unsupported objects, cycles, invalid integer ranges and malformed typed
  values explicitly. Arbitrary native XML and dates are not implicitly converted
  by the generic codec. Graph identity is not part of the contract.
- Keep generic callMethod type assertions compatible; document that a generic
  parameter does not convert or validate runtime values. Export the value type.

## XQuery adapter

Add Evaluator.xquery(query, options) in ws-client. It owns a reusable server-side
query template, preserves query text as data, materializes at most maxRows+1,
projects XML rows to ordinary typed data using actual server field values, and
returns rows, returnedRows, truncated and limitReason. Defaults: 100 rows,
maximum 1000 rows and 256 KiB of final JSON-compatible data. No retries, read-only
guarantee, database work bound or cancellation guarantee.

The public result uses bigint/number recursively. Native date fields in this
data projection become explicitly documented ISO strings; this does not add
native date support to callMethod. Preserve empty fields according to their
actual platform Value, not text guessing. SQL-to-XML losses before projection
(negative integers and SQL NULL/empty conflation) remain documented limitations.

String leaves in the query transport use JSON-string escaping on the server and
are decoded by this adapter. This protects CR/LF from SOAP XML normalization
without converting integer/real leaves to JSON text. The server projection must
also bound nested work and signal truncation only between whole rows.

Full XmlElem/XmDoc emulation, native XML round trips, form loading in Node and
new server DLLs are outside this change. The query projection uses server field
metadata, so catalog rows do not need client-side XMD loading.

## MCP

Use connection.evaluator.xquery instead of the MCP-specific JSON query bridge.
Keep input validation, bounded output and error handling. Convert bigint to a
JSON number when safe and to a decimal string otherwise; this is an explicit
MCP presentation policy. Reject nonfinite numbers in JSON instead of silently
turning them into null. Keep original query text and no automatic retries.

## Verification and release

Use regression tests based on actual HCM XML, then Node tests for the reusable
adapter and MCP. Run actual C-runtime round trips for int64 boundaries, negative
integers, real type preservation, null/undefined, nested arrays/records and
bounded XQuery. Re-run the existing MCP XQuery and file regressions. Capture
runtime identity, results and evaluator cleanup. Update the package README,
public docs, ADR, roadmap and changeset. No change to compiler issues #28–30.
