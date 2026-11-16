---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

BREAKING: decode every SOAP integer as bigint and encode every JavaScript number
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
