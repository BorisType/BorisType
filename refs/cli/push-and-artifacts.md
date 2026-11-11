# Push, retry и архивы

ZIP и online push — два независимых потребителя готового `dist/`. Ни один
не выполняет build/link и не делает module pipeline безопасным по памяти.
Развитие script/module сохраняет [freeze](../decisions/2026-11-05-script-module-memory-freeze.md).

[DeploySession](../../packages/bt-cli/src/core/pushing/session.ts) держит клиент
и evaluator; one-shot создаёт/закрывает её, dev queue инициализирует лениво и
переиспользует. Close удаляет evaluator best-effort, не выполняет отдельный logout.
[upload.ts](../../packages/bt-cli/src/core/pushing/upload.ts) передаёт `dist/*`
в `WshcmUploader` с destination `x-local://`; старое описание per-file
`evaluator.eval(upload_code)` и ресурсов `btc/resources/upload_prepare.bs`
не является текущим кодом.

[Reinit](../../packages/bt-cli/src/core/pushing/reinit.ts) собирает component
`<dirname>.init()` (кроме bt-runtime), затем standalone OnInit expressions из
`api_ext.xml`, вызывает `bt.init_require()` и выполняет каждую. Если init нет,
cache reset пропускается. Component order следует обходу директорий, standalone
— XML; dependency-topological order не гарантируется.
Имя каталога компонента интерполируется как identifier expression, поэтому
имена с дефисом/другим JS синтаксисом требуют исправления генерации вызова:
`my-component.init()` читается не как обращение по строковому имени.

Init error ловится и логируется индивидуально. Следствие: завершившийся push
не гарантирует, что все модули инициализированы. Reconnect ограничен одной
повторной **полной** операцией upload + reinit, а не последним файлом. Распознаются
некоторые сообщения WshcmException (`request failed/timed out`, ECONN*, timeout,
socket hang up); это не универсальная retry policy и не exactly-once.
Частичные эффекты initialization возможны до потери ответа. Транзакция deploy
и удаление серверных orphan files этим кодом не обещаются.

[DebouncedPushQueue](../../packages/bt-cli/src/core/pushing/queue.ts) объединяет
запросы за 500 мс, сериализует push и планирует ещё один после изменений во
время текущего. Это замена устаревшего push stub; keyboard UI/HMR сюда не входят.
Shutdown вызывает session.close, но не содержит отдельного ожидания уже идущего
execute. Корректное graceful shutdown при активном upload остаётся конкретным
lifecycle вопросом, а не доказанным crash.

## Конфигурационные ловушки

[config.ts](../../packages/bt-cli/src/core/pushing/config.ts) сливает CLI/file/defaults.
Однако Commander задаёт default `--https=false`; поэтому one-shot push без
флага перекрывает `https=true` файла. Dev без CLI connection options этого не
делает. HTTPS не меняет port=80. [properties.ts](../../packages/bt-cli/src/core/utils/properties.ts)
использует split('=',2), режет пароль с `=`, не снимает quotes/escapes и не
делает env interpolation. Эти особенности документированы как действующие
ограничения; необходимость менять parser/HTTPS default — отдельные bugfixes.

## Почему один ZIP

[artifact pipeline](../../packages/bt-cli/src/core/artifacting/index.ts) проверяет
dist и вызывает [stageMainArchive](../../packages/bt-cli/src/core/artifacting/stages/main-archive.ts).
Он кладёт все root items, **включая components**, в `artifact/main.zip`.
Component splitting из старого public guide не реализован и удалён из контракта;
это исправление знания, не изменение упаковки. `--clean` удаляет artifact dir,
без него main.zip перезаписывается, прочие старые файлы остаются. Архив не
содержит автоматически generated manifest и не обещает deterministic bytes.

[Пользовательский push](../../docs/guides/push-deploy.md),
[properties](../../docs/reference/btconfig-properties.md), [artifact](../../docs/reference/artifact-command.md).
