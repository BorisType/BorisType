# Архитектурные решения

Записи объясняют выбор и альтернативы на указанную дату. `Accepted` в старой ADR
не гарантирует, что все описанные детали до сих пор реализованы именно так.
Заменённое решение сохраняется как основание изменения, а не как параллельное правило.

## Активные границы

- [Архив прежних решений о режимах](../compiler/README.md#архив-режимов).
- [.NET workspace](2026-11-06-dotnet-workspace.md), [BS/C# search boundary](2026-11-06-dotnet-search-boundary.md).
- [Managed file tools](2026-11-06-managed-file-tools.md), [read grants/API 2](2026-11-06-read-aware-file-tools.md).
- [Native XML object tools](2026-11-10-native-xml-object-tools.md).
- [Portable agent skills](2026-11-06-portable-agent-skills.md).

## Компилятор и workflow

- [IR вместо transformers](2026-02-23-ir-over-transformers.md),
  [multi-pass](2026-03-14-bt-ir-multi-pass-refactoring.md).
- [Structured abrupt completions](2026-10-07-structured-abrupt-completion.md),
  [safe for updates](2026-10-07-safe-for-updates.md).
- [Unified env resolution](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/decisions/2026-02-26-unified-env-resolution.md),
  [expression extraction](2026-03-03-expression-extraction.md),
  [logical lowering](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/decisions/2026-03-09-logical-operators-lowering.md).
- [Optional chaining](https://github.com/BorisType/BorisType/blob/7a0b6a26a004f480f76fad9d534fedcde9f8aea7/refs/decisions/2026-02-23-nullish-check-optional-chaining.md),
  [numeric precision](2026-03-30-numeric-literal-precision.md).
- [Старая try/finally модель, заменена](2026-03-11-try-finally-desugaring.md).
- [Unified linking](2026-02-23-unified-linking.md),
  [incremental linking](2026-02-23-incremental-linking.md),
  [decoupled system packages](2026-02-26-decouple-system-packages.md),
  [pnpm migration](2026-02-24-pnpm-monorepo-migration.md).

Текущий поиск кода и проверок — через [compiler](../compiler/README.md) и
[development](../development.md). Новая ADR нужна при значимом выборе, а не для
каждого fix или изменения документации.
