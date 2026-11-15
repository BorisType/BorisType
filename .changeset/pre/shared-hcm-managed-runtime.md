---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Move platform operations and read grants into the reusable WshcmApi SDK. Bundle
production .NET dependencies with ws-client and prepare them automatically for
file operations, without separate DLL downloads. Verify installed bytes and
actual loaded MVID, preserve newer compatible runtimes, and report
restart_required when a cached assembly needs a normal HCM restart. Add
wshcm_runtime_status and structured runtime diagnostics; XML/XQuery remain
independent of DLL readiness. Building ws-client from source now requires the
repository .NET SDK; registry installs use the bundled artifacts.
