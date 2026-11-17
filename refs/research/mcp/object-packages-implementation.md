# Реализация пакетов объектов

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полный цикл штатных пакетов HCM и прямая выгрузка по IDs без изменения текущего пакета администратора.

**Architecture:** SDK владеет native BS операциями, сохранением локальных архивов и проверкой ZIP. MCP публикует тонкие tools над `WshcmApi.packages`. Штатные схемы сохраняются в общем документе; прямой экспорт использует несохранённый элемент схемы.

**Tech Stack:** Node 24.22.2, pnpm 12.16.1, TypeScript 6, Zod 4, native BorisScript, node:test; yauzl для ZIP без распаковки в пользовательские каталоги.

**Spec:** [Согласованный дизайн](../../mcp/object-packages.md). Пользователь разрешил реализацию 2026-11-17 после уточнения import, add/remove, штатных связей и прямой выгрузки.

## Global Constraints

- Имена: `import_package`, отдельные `add_package_objects` / `remove_package_objects`.
- `export_package` принимает ровно один источник: `schemaId` или `objectIds`.
- Точные object IDs — десятичные строки. Типизированные числа никогда не проходят через Number.
- `includeRelatedObjects` — штатный XMD/foreign обход. Wvars/mode resolvers остаются в TODO.
- Схемы явно адресуются по id; текущий выбор UI не переключается. Общий документ сохраняется с recheck, без обещания atomic CAS.
- ZIP остаётся вне контекста модели; stdio tools возвращают artifactId/localPath/sizeBytes/sha256. Resources необязательны для первого файлового сценария.
- Preview и import разделены. Импорт использует неизменяемую копию просмотренного архива, явный выбор и повторную проверку конфликтов.
- Timeout не отменяет native работу. Нет автоматического повтора; operationId известен до запроса, состояние сохраняется на сервере.
- Первая версия: objects, courses, web, custom_file; другие типы явно отклоняются до применения. Custom templates/access roles/files/deletions включаются явно.
- Границы: ZIP 128 MiB, суммарные распакованные bytes 512 MiB, 10000 ZIP entries, глубина ZIP 2, XML 32 MiB, 10000 objectIds на входе, страница 1–1000 элементов (по умолчанию 100), chunk 256 KiB.
- Артефакты хранятся в отдельном каталоге на машине SDK/MCP, переживают завершение сеанса; хранение handle — 24 часа. Прочтение существующего файла не означает разрешение его перезаписи.
- Работа в уже выделенной ветке `feat/object-packages`; не менять стенд/config, не публиковать npm. Все native fixtures принадлежат текущему запуску.
- Baseline: SDK 235/235, MCP 183/183. Запускать suites через `pnpm --filter ... test`; pack-smoke и docs checker не запускать одновременно.

### Task 1: Локальные ZIP артефакты и проверка состава

**Files:** создать `packages/ws-client/src/hcm/packages/artifacts.ts`, `archive.ts`, `archive-types.ts`; tests `packages/ws-client/test/package-artifacts.test.mjs`, `package-archive.test.mjs`. Manifest/lockfile меняются только для yauzl и необходимых types.

**Interfaces:**

```ts
interface PackageArtifact {
  artifactId: string;
  localPath: string;
  mimeType: "application/zip";
  sizeBytes: number;
  sha256: string;
  expiresAt: string;
}
class PackageArtifactStore {
  constructor(directory?: string);
  capture(localPath: string): Promise<PackageArtifact>;
  get(artifactId: string): Promise<PackageArtifact>;
}
interface PackageObjectEntry {
  id: string;
  type: string;
  name: string;
}
interface PackageArchivePart {
  id: string;
  type: string;
  url: string;
  baseUrl?: string;
  serverVersion?: string;
  objects: PackageObjectEntry[];
  hasCustomTemplates: boolean;
  hasAccessRoles: boolean;
  hasLists: boolean;
  deletedObjectIds: string[];
}
interface PackageArchiveInspection {
  packages: PackageArchivePart[];
  totalEntries: number;
  expandedBytes: number;
}
function inspectPackageArchive(localPath: string): Promise<PackageArchiveInspection>;
```

- [ ] RED: написать реальные fs/ZIP tests. Изменение оригинала после capture не меняет артефакт; подмена артефакта выявляется; относительный путь/oversize/необычный файл/неизвестный handle отклоняются, незавершённая копия удаляется.
- [ ] RED: сгенерированный ZIP с desc.xml и nested update.xml сохраняет `0x20000000000001` как `9007199254740993`. Reject traversal/absolute/backslash/encoded path escape, remote descriptor URL, duplicate entries/ids, encrypted ZIP, symlink, DTD/PI/form override, unsupported package type, missing descriptor target, malformed XML/ZIP, распакованные лимиты.
- [ ] Выполнить `pnpm --filter @boristype/ws-client build` и focused tests; убедиться, что поведение отсутствует до реализации.
- [ ] GREEN: использовать yauzl (проверить registry age, не ослаблять pins/policy), ленивое чтение entries с реальным счётчиком распакованных байт и CRC32; XML разбирать существующим saxes/fast-xml-parser без numeric coercion/entities. Проверять каждый уровень ZIP, не доверять declared sizes, не извлекать на диск по именам entries.
- [ ] GREEN: capture копирует regular file потоково в уникальный create-only файл, считает SHA-256, get повторно проверяет bytes/hash. Частично созданные собственные файлы удаляются; пользовательский исходник не меняется.
- [ ] Проверить focused tests, build и полный SDK suite; записать report/commit и передать на review.

### Task 2: Native операции и SDK packages API

**Files:** создать `packages/ws-client/src/hcm/packages/{contracts,native,schemas,transfer,service}.ts`, `packages/ws-client/resources/package-operation.bs`, `packages/ws-client/test/packages.test.mjs`, `packages/ws-client/test/e2e/packages.mjs`. Изменить API/schemas/index exports SDK.

**Interfaces:** использует интерфейсы Task 1; публикует `WshcmPackages`, `WshcmPackageError`, `packageSchemas`, readonly `WshcmApi.packages`.

```ts
class WshcmPackages {
  constructor(evaluator: WshcmEvaluator, options?: { artifactDirectory?: string });
  listSchemas(input?: unknown): Promise<unknown>;
  getSchema(input: unknown): Promise<unknown>;
  saveSchema(input: unknown): Promise<unknown>;
  deleteSchema(input: unknown): Promise<unknown>;
  addObjects(input: unknown): Promise<unknown>;
  removeObjects(input: unknown): Promise<unknown>;
  exportPackage(input: unknown): Promise<unknown>;
  inspectPackage(input: unknown): Promise<unknown>;
  importPackage(input: unknown): Promise<unknown>;
  getOperation(input: unknown): Promise<unknown>;
}
```

`packageSchemas` имеет ключи `listSchemas/getSchema/saveSchema/deleteSchema/addObjects/removeObjects/exportPackage/inspectPackage/importPackage/getOperation`, все strict Zod. Конкретные input/output types вывести из schemas и экспортировать, не оставлять публичное unknown в финальном API.

Inputs: list/get используют offset/limit; get требует schemaId. Create saveSchema требует name, без schemaId/revision; update/delete/add/remove требуют schemaId/revision от чтения общего документа. Save изменяет metadata/settings/флаги editable, add/remove состав по exact IDs. Options `includeCategories/includeRelatedObjects/includeFiles/includeAssessmentItems` по умолчанию false. Настройки схемы: customTemplates (имена каталогов), processCustomTemplates/processAccessRoles, файлы code/type/url/baseUrl. Export принимает schemaId (с revision) XOR objectIds. Inspect принимает artifactId XOR localPath либо inspectionId для следующих страниц. Import принимает inspectionId, необязательные packageIds/objectIds (иначе просмотренные объекты), skipConflictingIds и явные allowVersionMismatch/allowReimport/includeCustomTemplates/includeAccessRoles/includeFiles/includeDeletions/includeLists (по умолчанию false). Нельзя применить объект вне просмотренного состава.

- [ ] RED: tests на schema validation/defaults/XOR, exact IDs, stale common-document revision, сохранение соседних схем, независимость direct export от UI, bounded native carriers, неизвестный исход после lost acknowledgement и отсутствие повторов.
- [ ] RED: tests на immutable inspection/source binding, invalid selection, повторное применение/другую версию, конфликт типа, частичную ошибку и отчёты. Native doubles выполняют resource, а не проверяют substrings; внешняя платформа mock только на границе.
- [ ] GREEN: Node исполняет BS через `buildScript` с одноразовой подстановкой JSON, как object-operation; проверяет string carrier и native envelope. Общий XML snapshot хранится в SDK для revision, передаётся native для сравнения перед Save. Не выдавать snapshot в MCP response.
- [ ] GREEN: native читает схемы через логический OpenDoc; правит только выбранный элемент. Сериализовать mutations в экземпляре SDK, повторно сверять общий документ перед Save. Отдельный выбор local_settings не менять.
- [ ] GREEN: export формирует несохранённую схему для objectIds; вызывает штатные helpers с явными флагами и apply_to_all. Возвращает фактический состав/известные ошибки. Проверяет состав полученного ZIP против запрошенных IDs; сохраняет artifact и partial, если не все собраны.
- [ ] GREEN: transfer использует физические собственные файлы и native range API (проверить native границы диапазона), base64 только в chunks 256 KiB. Upload сверяется чтением bytes/hash до native preview. Операции не используют managed DLL и не гонят ZIP через tool text.
- [ ] GREEN: native receipt расположен в собственном `x-local://trash/boristype_packages/<operationId>/`, физические пути выводятся платформой, UUID/operation names проверяются. Записывать phase/status до вызова и после. Status query может читать receipt после timeout; не обещать отмену. Не принимать произвольный server path от tool caller.
- [ ] GREEN: inspect сохраняет native form серверно, а SDK связывает inspectionId с неизменяемым локальным архивом. Перед import сверяет архив, повторно читает conflicts/versions/reimport; использует выбранные поля штатной формы, без автоперенумерации.
- [ ] GREEN: import использует native процесс и возвращает платформенные reports/native download IDs. Общий completed отдельно от verification (`platform_report_only`, пока нет доказанного per-object результата); известные частичные/ошибки не выдавать за полный успех. Исход неизвестен при transport failure.
- [ ] Native acceptance на существующем стенде: own cost_center fixtures create/export/inspect/import create/update/skip, conflict/version/reimport negatives, current schema XML unchanged для direct path, схема create/add/remove/rename/delete с сохранением соседней baseline, chunk boundary roundtrip, умеренно большой набор/ZIP. Credentials через env; все own objects/reports/temp files/evaluators очищаются с receipt, не удалять чужое.
- [ ] Сборка + SDK suite + native runner; report/commit и task review. Файлы/roles/custom fields при недоступном fixture честно отметить как непроверенные; неизвестные package types не применять.

### Task 3: MCP tools, публичная документация и итоговая проверка

**Files:** создать `packages/mcp-server/src/tools/packages.ts`, `packages/mcp-server/test/packages.test.mjs`, `packages/mcp-server/test/e2e/packages.mjs`; изменить tools/index/server, package manifests scripts, README SDK/MCP, docs/guides/mcp-server.md, refs/mcp/object-packages.md, refs/mcp/README.md, TODO.md и changeset.

**Interfaces:** WshcmApi.packages и packageSchemas из Task 2. Десять tools соответствуют методам SDK:

```ts
const tools = {
  list_package_schemas: "listSchemas",
  get_package_schema: "getSchema",
  save_package_schema: "saveSchema",
  delete_package_schema: "deleteSchema",
  add_package_objects: "addObjects",
  remove_package_objects: "removeObjects",
  export_package: "exportPackage",
  inspect_package: "inspectPackage",
  import_package: "importPackage",
  get_package_operation: "getOperation",
};
```

- [ ] RED: InMemoryTransport listTools/callTool tests проверяют входные schemas, error JSON с operationId/unknown, paginated outputs и отсутствие archive base64 в text. Проверить реальную регистрацию, а не мок api getter.
- [ ] GREEN: thin handlers сериализуют SDK results и WshcmPackageError.details; правильно аннотируют import/save/delete как mutations, export/inspect как временные побочные эффекты. Описать XMD-only links, localPath scope, immutable inspect/import, timeout без retries.
- [ ] GREEN: stderr/stdio lifecycle без регрессии; при большом ответе пагинация, error reports ограничены с явным truncated marker и способом получить следующие страницы.
- [ ] Native MCP runner через CLI/stdio с собственными fixtures проверяет export by IDs, artifact path/hash, inspect/import и status; в том числе сохранность current native schema и очистку.
- [ ] Обновить публичные инструкции, artifact lifetime/limits, примеры export/import и схем; отдельно оставить TODO прикладных wvars/mode resolvers, не превращая их в реализованные флаги. Статус дизайна обновить на фактический результат и точные границы проверок.
- [ ] Выполнить SDK/MCP builds + обе suites; focused native runners; `pnpm docs:check`, targeted Prettier, `git diff --check`, затем pack-smoke отдельно от checker. Добавить minor changesets для SDK/MCP.
- [ ] Получить общий code review, устранить findings, финальная проверка и commit. Не публиковать npm и не выполнять merge без отдельного указания.
