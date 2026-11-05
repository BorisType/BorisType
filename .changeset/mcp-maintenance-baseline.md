---
"@boristype/mcp-server": patch
"@boristype/ws-client": patch
---

Refresh MCP dependencies for the Node 24 toolchain, package the required BS
resources, and advertise only implemented tools. Expose createServer(connection)
for transport-independent setup. Preserve literal template parameters and reject
non-string read/list results instead of reporting empty content.

Preserve SOAP string whitespace and numeric-looking text while retaining explicit
VALUE-TYPE conversion for integers, reals and booleans. Add local protocol,
serialization and tarball regression checks; native HCM acceptance remains pending.
