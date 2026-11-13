---
"@boristype/mcp-server": minor
"@boristype/ws-client": patch
---

Include the native XML form/object tools in the first public MCP release:
load an expanded XMD form, read complete object XML with a readToken, and create
or replace an object using XML with partial validation and stale-read protection.
Preserve exact decimal IDs; platform Save/hooks can partially persist changes.
The nine physical filesystem tools require the separate FileSystem DLL API 2;
XQuery and XML object tools use their packaged BorisScript bridges without it.

Read CLI and MCP initialization versions from the installed package manifest so
Changesets version bumps are reflected in both public entry points. Include a
ws-client README describing its exports, evaluator lifecycle and transport limits.
