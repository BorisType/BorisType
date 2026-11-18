---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Start MCP when HCM is offline. Initialize, list and ping work immediately, and the next tool call can recover HCM access in the same stdio session. Active read tokens and package handles survive reconnects. Connection errors distinguish authentication, transport and preflight failures. A lost response leaves the outcome unknown and sends the business operation only once.

The SDK adds typed HTTP request and dispatch errors, per-request deadlines, and owned evaluator probing and repair. Use `--connection-timeout-ms` to override the MCP preparation deadline of 5000 ms per HTTP request.

Use `--package-artifact-directory` to select an absolute directory for local package ZIPs and metadata. The SDK exposes the same setting through the optional package options on `WshcmApi`. The default location stays `~/.boristype/package-artifacts`.
