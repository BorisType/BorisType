---
"@boristype/mcp-server": minor
---

Move read/write/list/delete to the standalone .NET filesystem library and add targeted edit with dry-run, unique sequential replacements, BOM preservation and optional original-byte SHA256 preconditions. All six tools now require BorisType.FileSystem.dll 0.1.0-alpha.3 / API 1, installed separately on HCM. File IO enforces strict UTF-8, a 1 MiB text limit and explicit link/readonly/error policies. Read can return metadata; existing default read/write/list/delete success formats are preserved.
