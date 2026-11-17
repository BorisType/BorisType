---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Add native object package workflows: explicitly addressed saved schemas, direct-ID or schema ZIP export, persistent local artifacts, immutable inspection and selected import, and durable operation receipts. The MCP server exposes ten matching package tools with bounded text and pagination. Exact IDs remain decimal strings; imports recheck conflicts, require explicit extras/version/reimport flags, and never retry automatically after timeout. Native acceptance currently covers objects on Linux C/PostgreSQL; additional package types and dependency resolvers remain limited.
