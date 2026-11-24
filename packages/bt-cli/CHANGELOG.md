# @boristype/bt-cli

## 0.1.0-alpha.15

### Minor Changes

- d1790e7: `btc link` включает определения из `objects/<тип>/<ID>.xml` в поставку HCM. При запуске сервер перечисляет файлы, создаёт отсутствующие документы с заданными ID и применяет частичные изменения к существующим. `btc objects apply <файл> --dry-run` проверяет одно определение на работающем стенде.

  Для скаляров в поставке атрибут `default="true"` задаёт начальное значение при создании документа или строки с первичным ключом. Повторные применения сохраняют значение стенда.

### Patch Changes

- Updated dependencies [c4f2df9]
- Updated dependencies [d1790e7]
  - @boristype/ws-client@0.1.0-alpha.11

## 0.1.0-alpha.14

### Minor Changes

- 56b2d84: Use `bare` as the only supported compile mode in this alpha series. Configurations that select `script` or `module` must be updated before they can use this release. The previous implementations and regression suites are preserved in the `archive/compiler-modes` branch.

### Patch Changes

- Updated dependencies [56b2d84]
- Updated dependencies [56b2d84]
- Updated dependencies [56b2d84]
- Updated dependencies [56b2d84]
- Updated dependencies [56b2d84]
  - @boristype/ws-client@0.1.0-alpha.10
  - @boristype/bt-ir@0.1.0-alpha.8

## 0.1.0-alpha.13

### Patch Changes

- Updated dependencies [84e6b68]
- Updated dependencies [78ed795]
  - @boristype/ws-client@0.1.0-alpha.9

## 0.1.0-alpha.12

### Patch Changes

- Updated dependencies [fa02203]
- Updated dependencies [739b700]
  - @boristype/ws-client@0.1.0-alpha.8

## 0.1.0-alpha.11

### Patch Changes

- Updated dependencies [191595c]
- Updated dependencies [191595c]
- Updated dependencies [191595c]
  - @boristype/ws-client@0.1.0-alpha.7

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [0264f3a]
  - @boristype/ws-client@0.1.0-alpha.6

## 0.1.0-alpha.9

### Patch Changes

- Updated dependencies [1580cd3]
  - @boristype/ws-client@0.1.0-alpha.5

## 0.1.0-alpha.8

### Patch Changes

- Publish the coordinated alpha package set through per-package GitHub Actions
  trusted publishers, retaining independent versions and the existing CLI/runtime/
  ESLint fixed group. Include the accumulated compiler, CLI and transport changes
  prepared in the preceding release checkpoint. Exclude compiled ESLint tests from
  the npm archive and include the runtime README with its deployment and memory
  limitations. Runtime behavior is unchanged by this release preparation.
- Updated dependencies
  - @boristype/bt-ir@0.1.0-alpha.7
  - @boristype/ws-client@0.1.0-alpha.4
  - @boristype/ws-version@0.1.0-alpha.3

## 0.1.0-alpha.7

### Patch Changes

- d18b33e: Update the MCP SDK client/server to 2.4.0, Chokidar to 6.0.0 and Chalk to
  6.0.1. Retain TypeScript 6 Compiler API compatibility. Verify CLI file watching
  against real filesystem events and check watcher shutdown on Linux and Windows.
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

- Updated dependencies
- Updated dependencies [fd1d248]
- Updated dependencies [07b6cc2]
- Updated dependencies [3c71b9c]
- Updated dependencies [6d35685]
  - @boristype/ws-client@0.1.0-alpha.3
  - @boristype/bt-ir@0.1.0-alpha.6
