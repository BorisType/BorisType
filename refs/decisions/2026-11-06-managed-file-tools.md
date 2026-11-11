# Managed file IO and exact targeted edits

**Date:** 2026-11-06

**Status:** Accepted

## Context

Search already uses a standalone .NET DLL behind a BS URL resolver. The user
requested migration of the remaining four file tools and targeted editing.
Different IO implementations otherwise produce different encoding/link/error
policies; the edit stub has no implementation or runtime evidence.

## Decision

Use the same BS resolver and string JSON bridge for five unique Files entry
points. The DLL performs strict bounded UTF-8 IO and returns versioned structured
errors. The MCP adapter validates payloads and preserves default success formats.
All six tools now require alpha.3 of the separately installed DLL.

Edits use exact ordinal replacements, one occurrence each including overlapping
matches, applied sequentially in memory. Preview and original-byte SHA256 checks
support review before commit. All patches must validate before writing. Write
adds BOM to preserve the established contract; edit preserves original BOM.

Write/edit prepare and flush a temporary sibling, then rename. Process-wide
mutation locking avoids an unbounded per-path lock dictionary. Edit rechecks
original bytes before rename; no portable cross-process CAS is claimed.

## Consequences

The same managed policy serves Windows/Linux without shell or Datex callbacks.
Text IO now explicitly rejects invalid UTF-8, NUL, oversize files and links.
Listing marks links without traversal and fails at its budget instead of returning
an incomplete array. File roots for listing are errors.

Replacement changes inode/hardlink relationships and may change owner/ACL; only
existing Unix rwx are preserved. External writes after the final check remain
possible. Transport failure after commit does not undo a mutation. Edit requests
are consequently marked non-idempotent.

Managed/protocol tests and native Linux HCM acceptance passed; other OS/runtime
combinations require their own checks. [Contract](../research/dotnet/07-file-tools-design.md),
[evidence](../research/dotnet/09-file-tools-results.md).

## Alternatives Considered

- Keep four tools in BS: avoids new DLL requirement for them but leaves divergent
  filesystem semantics and makes targeted edit substantially harder.
- Write in place: preserves inode but risks partial/truncated files on failure.
- Fuzzy/regex patches: convenient but ambiguous; defer until there is an explicit
  contract and evidence. Exact replacement satisfies this step.
