---
"@boristype/mcp-server": minor
"@boristype/ws-client": patch
---

Add `wshcm_xquery` through the existing server-side evaluator, including the `sql:`
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
