---
"@boristype/mcp-server": patch
"@boristype/ws-client": patch
"@boristype/bt-cli": patch
---

Migrate to the stable MCP TypeScript SDK v2 split packages and Zod 4 object schemas.
Keep the server package in runtime dependencies and the client package in test-only
dependencies. Refresh MCP dependencies for the Node 24 toolchain, package the required BS
resources, and advertise only implemented tools. Expose createServer(connection)
for transport-independent setup. Preserve literal template parameters and reject
non-string read/list results instead of reporting empty content.

Preserve SOAP string whitespace and numeric-looking text while retaining explicit
VALUE-TYPE conversion for integers, reals and booleans. Add local protocol,
serialization and tarball regression checks.

Update fast-xml-parser to ^5.11.2 in ws-client and bt-cli, and align workspace
development types with @types/node ^24.19.2 for the Node 24 toolchain.
