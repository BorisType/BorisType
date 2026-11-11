# ADR 005: pnpm workspace и общая сборка

Дата решения: 2026-02-24. Статус: принято; версии и состав пакетов определяются
актуальными manifests, а не этой записью.

## Причина и выбор

Отдельные package-lock, относительные `file:` dependencies и ручная последовательная
сборка усложняли согласование версий и порядка. Выбраны pnpm workspace с единым
lockfile, Turborepo для build graph/cache, syncpack для consistency и Changesets
для release metadata. Межпакетные зависимости используют workspace protocol.

Это снижает повторную настройку, но frozen lockfile не делает сборку независимой
от ОС, native prerequisites, registry и undeclared inputs. Strict resolution
требует явно объявлять dependencies; cache полезен только при полном описании inputs.
Исторические `2.7s cached / 6s cold` — отдельное наблюдение, не performance SLA.

Цикл compiler ↔ runtime мешал build graph. Сначала использовали peer dependency,
затем runtime стали искать в проекте пользователя:
[следующее решение](2026-02-26-decouple-system-packages.md). Публикуемые имена,
Changesets linked group и postversion normalization описаны в
[release and maintenance](../cli/release-and-maintenance.md); их текущий состав
проверяется по config. Старое «private всегда без scope» не является правилом.

## Альтернативы

npm workspaces могли дать общий lockfile; прежнее утверждение, что они его не
поддерживают, неверно. pnpm предпочли за isolation и выбранный workspace workflow.
Yarn PnP требовал адаптации части инструментов; Nx сочли тяжелее нужного на тот
момент; отдельные installs не решали разрозненность build/release процесса.

Риск перехода fast-xml-parser v4 → v5 был исторической проверкой совместимости,
а не вечным запретом обновлений. Текущие advisories и cooldown оцениваются отдельно.
Команды установки и проверок — [development](../development.md).
