# File search implementation plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task inline in
> the current feature branch. Preserve user `.agents/`; do not publish remotely.

**Goal:** Реальный ограниченный файловый поиск через C# DLL и MCP/BS adapter.

**Architecture:** BS преобразует URL; чистое C# ядро обходит filesystem и ищет;
MCP проверяет JSON contract и возвращает root URL плюс relative matches.

**Tech Stack:** SDK 9.0.320 / net9.0, xUnit, Node 24, TypeScript, Zod/MCP 2.x.

**Spec:** [04-search-design.md](04-search-design.md).

## Global constraints

- DLL 0.1.0-alpha.2 / apiVersion 1 / capability search; no new dependency.
- Default/hard limits и exact request/response — из spec tables.
- No Datex callback, shell, module/script compiler work or existing tool rewrite.
- Cooperative timeout; no hard filesystem cancellation guarantee.

## Task 1: Search JSON ABI, bounded traversal и text matching

**Files:** Create `src/BorisType.FileSystem/Search.cs`, `SearchContract.cs`,
`GlobPattern.cs` внутри packages/dotnet; tests `SearchTests.cs` и
`TemporaryTree.cs`; modify LibraryInfo.cs, csproj и LibraryInfoTests.cs.

**Interfaces:** `Search.FindJson(string rootPath, string requestJson) -> string`;
managed FindJsonWithCancellation с третьим CancellationToken. Contract serializes camelCase,
strict options parsing, null fields matches не сериализуются.

- [x] ABI regression через reflection: Assert.NotNull для public Search type и
      FindJson(string,string), затем вызвать на настоящем temp tree. Увидеть RED.
- [x] Cases с ручными expected: basename `*.bs` на разных глубинах, `**/*.bs`
      с zero directory, scoped patterns, exclusions pruning; name-only readBytes=0.
- [x] Text fixtures `\uFEFFПривет\r\nabc needle\rNEEDLE\n` → line2/column5;
      literal/regex/case, метасимволы в literal, UTF-16 column, один hit на строку.
- [x] Negative/limit fixtures: unknown option/null/ranges/invalid pattern/root,
      absent root, binary, invalid UTF-8, size, maxEntries/results/totalBytes/depth,
      response bytes, overlong lines, root/child links, already cancelled token и
      catastrophic regex. Увидеть RED до соответствующей implementation.
- [x] Реализовать strict contract, glob compiler и traversal. Сверить каждый
      counter/limit с реальными файлами, ограничить чтение и сериализацию matches.
- [x] Поднять capability/version и проверить metadata ABI, build, unit, ZIP test.

## Task 2: MCP/BS adapter

**Files:** Replace search-files.ts/resources/search-files.bs; export/register
в tools/index.ts/server.ts; create test/search.test.mjs, adjust server/stdio tests.

**Interfaces:** Tool wshcm_search_files принимает path x-local URL плюс options
из spec. BS вызывает UrlToFilePath, GetAssembly и FindJson; EncodeJson защищает
строковый carrier. Node декодирует обе JSON ступени и валидирует полный response.

- [x] Добавить падающие protocol tests tools/list и call через InMemoryTransport.
      VM запускает реальный template; CLR boundary возвращает фиксированный JSON
      contract, resolver проверяет исходный URL. Проверить literal parameter transport
      с quotes/backslash/Unicode/template-like text по реальному handler.
- [x] Cases malformed wire/response, unsupported apiVersion, absent DLL, invalid
      input без evaluator call. Реализовать adapter до GREEN. Existing four tools
      и unknown-tool behavior остаются рабочими.
- [x] Build MCP, unit/stdio tests, tarball smoke; DLL assets не включать в npm.

## Task 3: Acceptance, docs и локальная фиксация

**Files:** Add bounded search native fixture/test under mcp-server/test/e2e;
update .NET/MCP README, docs guides, ROADMAP, plans index/verification report.

- [x] Native test использует explicit running local stand и отдельно установленную
      DLL. Seed только unique temporary directory, проверить результаты/cleanup.
      Не запускать unsafe callback, не сканировать весь сервер.
- [x] Если стенд остановлен — сообщить факт и подготовить runnable test; этот
      факт сам по себе не блокирует независимые managed/protocol проверки.
- [x] Документировать install/API/filters/limits/UTF-8/link policy и границы
      cooperative deadline; отделить managed, mock/VM и native evidence.
- [x] Review кода, исправить существенные замечания, выполнить build/unit/pack,
      Node regression tests, format/lint/docs/diff checks; сохранить локальные commits.

Результаты реализации и native acceptance gap: [06-search-results.md](06-search-results.md).
