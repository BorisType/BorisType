# File search through a BS resolver and standalone .NET library

**Date:** 2026-11-06

**Status:** Accepted

## Context

MCP needs filename and content search on Windows and Linux WebSoft HCM servers.
BorisScript is unsuitable for implementing a bounded grep equivalent, and a
native grep executable cannot be assumed. Platform URL mapping is separate from
filesystem traversal. Earlier Datex callback experiments crashed the C-runtime;
the cause is unresolved.

## Decision

BS resolves `x-local://` using `UrlToFilePath` and passes the absolute physical
root plus JSON options to the unique public method
`BorisType.FileSystem.Search.FindJson(string, string)`. The standalone library
has no Datex dependency or platform callback. A separately named managed method
supports CancellationToken without reflection overload ambiguity.

C# implements restricted globs, strict UTF-8 line matching and explicit work,
regex and output budgets. MCP validates the versioned JSON response, adds the
original root URL and enforces the final output byte limit. Symlinks/junctions
are skipped; partial coverage is represented by limits and skipped counters.
The initial search step kept the four existing implementations. The subsequent
[file tools decision](2026-11-06-managed-file-tools.md) migrates them to the same boundary.

## Consequences

The same managed implementation can run on Windows and Linux without shell
commands. Installation requires a separate compatible DLL and CLR. Cooperative
deadlines cannot interrupt blocked filesystem syscalls. Ordinary stable trees
are supported; path races are not a security sandbox.

Managed filesystem tests and MCP/VM tests validate independent layers. Bounded
native acceptance of resolver and bridge passed on Linux HCM 2025.2.1333 / CLR
9.0.11. Windows and other HCM versions still require their own acceptance.
See the [contract](../dotnet/search.md) and
[evidence](../research/dotnet/06-search-results.md).

## Alternatives Considered

- Implement traversal and matching in BS: less deployment work, substantially
  harder bounds, text handling and portable performance.
- Execute grep or a platform-specific process: external dependency and divergent
  Windows/Linux behavior.
- Resolve platform URLs from C# through Datex callbacks: tighter coupling and an
  unresolved native callback failure. Keep URL mapping in BS for this step.
