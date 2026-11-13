# CLI: сборка, watch и поставка

Пользовательские команды и конфигурация находятся в [сайте](../../docs/guides/getting-started.md).
Здесь — основания устройства и проверенные ограничения реализации:

- [Build/watch](build-and-watch.md): разделение TS diagnostics и BS emit, initial barrier, incremental границы.
- [Линковка и кэш](linking-and-cache.md): layout, system/library, invalidation, orphan output.
- [Push и ZIP](push-and-artifacts.md): upload/reinit, retry, ошибки, отличие от artifact.
- [Monorepo, release и maintenance](release-and-maintenance.md): текущий граф, fixed group, supply-chain policy.
- [npm-релизы](npm-releases.md): общий release PR, пакетные теги, CI и настройка npm trust.

Развитие script/module заморожено до принятия стратегии памяти C-runtime;
наличие module default, watch и deploy не означает production acceptance.
В этой ревизии менялись знания и навигация, не поведение CLI.
Сверка 2026-11-11 основана на текущем исходном коде и manifests; runtime HCM не запускался.
