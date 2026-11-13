# @boristype/ws-client

## 0.1.0-alpha.4

### Patch Changes

- Publish the coordinated alpha package set through per-package GitHub Actions
  trusted publishers, retaining independent versions and the existing CLI/runtime/
  ESLint fixed group. Include the accumulated compiler, CLI and transport changes
  prepared in the preceding release checkpoint. Exclude compiled ESLint tests from
  the npm archive and include the runtime README with its deployment and memory
  limitations. Runtime behavior is unchanged by this release preparation.

## 0.1.0-alpha.3

### Patch Changes

- Include the native XML form/object tools in the first public MCP release:
  load an expanded XMD form, read complete object XML with a readToken, and create
  or replace an object using XML with partial validation and stale-read protection.
  Preserve exact decimal IDs; platform Save/hooks can partially persist changes.
  The nine physical filesystem tools require the separate FileSystem DLL API 2;
  XQuery and XML object tools use their packaged BorisScript bridges without it.

  Read CLI and MCP initialization versions from the installed package manifest so
  Changesets version bumps are reflected in both public entry points. Include a
  ws-client README describing its exports, evaluator lifecycle and transport limits.

- fd1d248: Add nine physical filesystem tools over stdio and authenticated HCM SOAP:
  read, write, edit, list, search, delete, create-directory, move and get-info.
  All require the separately installed BorisType.FileSystem **0.1.0-alpha.4 / API 2**;
  the npm package does not include the DLL. SQL-backed URL resources are outside
  this physical filesystem contract.

  This changes the prototype API: read always returns JSON with original-byte
  SHA256, BOM, UTF-16 range coordinates and a per-server readToken. Edit requires
  coverage of each replacement; overwrite requires full coverage. Write defaults
  to create-only. Text IO uses strict UTF-8 and a 1 MiB limit; search reports its
  budgets and incomplete coverage. Move never overwrites or falls back to copy/delete.

  Use stable MCP SDK v2 split packages and Zod 4 schemas. Package the two active BS
  bridges, remove unimplemented tools and stale build output, and clean up the
  temporary evaluator on stdio EOF and signals. Add protocol, real-filesystem,
  tarball and opt-in native HCM tests; the DLL ZIP has a verified file manifest.

  Preserve SOAP string whitespace, CR/LF and numeric-looking text while retaining
  explicit VALUE-TYPE conversion. Update fast-xml-parser to ^5.11.2 in ws-client
  and bt-cli, and align development types with @types/node ^24.19.2.

- 07b6cc2: Add `wshcm_xquery` through the existing server-side evaluator, including the `sql:`
  prefix, without requiring a BorisType DLL. Pass query text unchanged and return
  bounded platform JSON with row counts and truncation metadata, without automatic
  retries or Node numeric re-serialization. Document that queries may modify data
  and that output limits and transport timeouts do not guarantee bounded database
  work, cancellation, rollback or lossless platform type conversion.

  Decode HTTP response UTF-8 as a stream so multibyte characters split across
  network chunks survive SOAP parsing. Add a local HTTP regression and native
  large Unicode query acceptance on the existing HCM stand.

  Send cross-tool usage instructions during MCP initialization, including
  read-aware file workflows, physical storage boundaries and query result limits.
  Add an optional installable `boristype-mcp` skill with file and query references.
