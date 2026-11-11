# Read grants for MCP edits and a nine-tool filesystem core

**Date:** 2026-11-06

**Status:** Accepted

## Context

An optional hash prevents some stale writes but does not establish that an agent
read the edited text in this server instance. A correct guessed oldText and an
unconditional write could bypass that intent. The remaining source stubs also
mixed future scope with obsolete, unverified BS implementations.

## Decision

Ship DLL alpha.4/API 2 and update the MCP adapter together. Read always returns
JSON with exact content, original-byte hash, UTF-16/line coordinates and a random
read-token. Store bounded grants per createServer, not globally. Edits require
a live token and complete coverage of each oldText in the matching byte version.
The DLL checks hash/coverage and transforms intervals for sequential patches.

Each read returns a fresh token and revokes the previous URL token. Accumulation
requires the preceding token in the next read request; otherwise only the new
interval is granted. A lost response cannot silently widen an earlier grant.
Mutations invalidate their URL grants even when the response is lost. Preview
does not expand coverage. Exact URL binding deliberately rejects alias reuse.

Default write is create-only. Overwrite requires a fully read snapshot. Add
mkdir, metadata and native no-replace rename to the existing six tools. Rename
uses Linux renameat2 or Windows MoveFileExW without copy fallback; cross-device
moves fail explicitly. Remove deferred tree/multiple-read stubs and unused BS
resources; clean emitted build files before compilation and inspect the tarball.

## Consequences

Clients must use read tokens, and refresh them after mutation attempts. A hash
alone or metadata/search results do not authorize edits. Range accumulation is
explicit. Limits are 128 snapshots, 256 merged ranges per snapshot, 30 minutes
since the latest read; the text file limit remains 1 MiB even for range reads.

Isolation between agent conversations sharing a server is not promised. Sending
text to a client does not prove model receipt or comprehension. This is a tool
policy, not a sandbox against direct SOAP or intentional delete/create.

Repeated pre-commit byte checks remain optimistic: arbitrary external writers
may race between comparison and rename. Strict cross-process compare-and-replace
is deferred to separate Linux/Windows research. Existing IO/ACL/VFS limitations
remain. Native Linux HCM acceptance is distinct from managed/protocol evidence;
Windows HCM requires its own acceptance.

## Alternatives Considered

- Rely on each client's harness: inconsistent enforcement across MCP clients.
- Require only expectedSha256: does not establish prior reading or range coverage.
- Reuse and implicitly extend one token: later replies may widen an earlier grant
  without the client acknowledging receipt of their tokens.
- Close the external race now: ordinary process/file locks do not establish a
  portable protocol with unrelated platform writers; defer the research.

[Contract](../research/dotnet/11-read-aware-files-design.md),
[verification](../research/dotnet/13-read-aware-files-results.md).
