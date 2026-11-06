---
"@boristype/mcp-server": patch
"@boristype/ws-client": patch
---

Preserve trailing whitespace and CR/LF in SOAP request values with XML character
references. Read MCP files using explicit UTF-8 decoding and a JSON response
carrier to avoid native charset guessing and SOAP CRLF normalization; omit the
file's leading UTF-8 signature from returned text. Native text writes retain the
platform's UTF-8 BOM behavior.

Clean up the temporary evaluator on stdio EOF and signals through one shutdown
path, and report unconfirmed cleanup as failure. Add opt-in local Docker e2e
coverage through the actual CLI/stdio/SOAP stack with independent file checks.
