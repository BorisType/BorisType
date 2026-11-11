# ADR 007: System packages принадлежат проекту пользователя

Дата решения: 2026-02-26. Статус: подход сохранён.

## Причина

Runtime собирается компилятором; если compiler одновременно зависит от его build,
получается цикл bootstrap/Turbo graph. Поиск system packages в dependencies самого
compiler также лишал проект явного контроля того, что попадёт в deploy.

## Выбор и следствия

Искать system packages в dependencies/devDependencies проекта, разрешая их
относительно project package.json и проверяя `ws:package: system`. Пользователь
явно устанавливает нужный runtime. Линковка и cache описаны в
[linking-and-cache](../cli/linking-and-cache.md), публичные настройки — в
[package types](../../docs/reference/package-types.md).

`--external-runtime` пропускает linking system packages, когда их deployment
обеспечен отдельно. Это не установка runtime на сервере, не подтверждение его
наличия и не совместимость произвольных версий compiler/runtime. Сообщение об
отсутствии system packages также не доказывает, что внешний runtime корректен.

Обязательная прямая dependency давала автоматическую установку, но связывала
bootstrap и версии. Peer dependency был промежуточным способом разорвать build
cycle; явная project dependency делает владельца deploy яснее. Цена — пользователю
нужно самому согласовать и установить пакеты.

Старые «~X MB → ~Y MB», «полностью production-ready» и общее «Turborepo всегда
строит в правильном порядке» не были измерениями/acceptance evidence и удалены.
Исторический пример `^0.1.0` не задаёт текущий version pin. Предполагаемая лёгкость
compiler не означает гарантии размера или времени bootstrap.
