> Исторический материал из `plans/mcp-server/02-sdk-v2-migration.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../README.md).

# MCP-02: переход на стабильный SDK v2

Дата: 2026-11-05. Ветка: `feat/mcp-server`, draft PR #48.

## Причина

При первом обновлении был выбран latest legacy package `@modelcontextprotocol/sdk`
1.x. Это не последняя стабильная линия TypeScript SDK: v2 опубликована под
раздельными именами `@modelcontextprotocol/server` и `@modelcontextprotocol/client`.
Выбор только по dist-tag старого пакета пропустил major migration.

На момент проверки npm latest для старого имени — 1.32.2, для новых пакетов —
2.4.0. Последняя версия, прошедшая repository cooldown 14 дней, — 2.3.1
(опубликована 2026-10-05). Версия 2.4.0 от 2026-10-23 ещё не прошла выдержку;
исключение из policy не добавлялось. Изолированная миграция не требует изменения
HCM helpers или разработки новых tools.

## Изменения

- Runtime dependency: `@modelcontextprotocol/server: ^2.3.1`.
- Test-only dependency: `@modelcontextprotocol/client: ^2.3.1`.
- Старый `@modelcontextprotocol/sdk` удалён из manifest и lockfile.
- `McpServer` импортируется из server root, `StdioServerTransport` — из
  `@modelcontextprotocol/server/stdio`.
- Все 11 исходных registrations используют явный Zod 4 `z.object(...)`
  вместо deprecated raw-shape overload. Семь заглушек остаются выключенными.
- Тесты используют client v2 и обе половины `InMemoryTransport` из одного
  package export. Проверяется сохранение descriptions в JSON Schema и отказ
  неизвестного tool с `InvalidParams`.
- Добавлен subprocess stdio test с локальным fake connection: legacy protocol
  2025-11-25, initialize/list/call, точное строковое содержимое. Это проверка
  настоящих stdin/stdout transports без HCM или исполнения BS на платформе.

## Источники

- [Официальный README: стабильная линия v2 и legacy v1](https://github.com/modelcontextprotocol/typescript-sdk#readme).
- [Официальное руководство миграции](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2).
- [Server package в npm](https://www.npmjs.com/package/@modelcontextprotocol/server).
- [Client package в npm](https://www.npmjs.com/package/@modelcontextprotocol/client).
- Registry metadata и установленные declarations именно 2.3.1 сверены локально.
  Документация main может описывать более свежую версию; acceptance задают
  сборка и тесты на версиях из lockfile.

## Проверки

- `pnpm install --frozen-lockfile`: PASS, policy checks включены.
- `pnpm exec turbo run build`: PASS, 15/15 (14 cache hits, MCP пересобран).
- CI unit-test command: PASS, 114/114 (bt-ir 61, ESLint 5, SOAP 19, MCP 29).
- MCP tests включают новый отказ неизвестного tool и настоящий stdio subprocess
  exchange с legacy protocol 2025-11-25; HCM connection отсутствует.
- `pnpm --filter @boristype/mcp-server test:pack`: PASS.
- `pnpm lint`, `pnpm format:check`, `pnpm check-versions`, `pnpm docs:build`,
  `git diff --check`: PASS. Прежние 45 lint warnings сохранены.
- `pnpm audit --audit-level=high`: PASS, прежняя moderate minimatch advisory
  остаётся, новых high/critical нет.
- Поиск старого `@modelcontextprotocol/sdk` в package sources/tests/manifest
  и lockfile не находит совпадений. Исторические audit notes сохраняются.

Native HCM acceptance, lifecycle cleanup и platform path/encoding contracts
остаются отдельными задачами из предыдущего checkpoint.
