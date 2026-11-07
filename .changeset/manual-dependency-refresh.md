---
"@boristype/bt-cli": patch
"@boristype/mcp-server": patch
---

Update the MCP SDK client/server to 2.4.0, Chokidar to 6.0.0 and Chalk to
6.0.1. Retain TypeScript 6 Compiler API compatibility. Verify CLI file watching
against real filesystem events and check watcher shutdown on Linux and Windows.
