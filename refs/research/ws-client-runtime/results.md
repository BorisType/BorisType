# Shared HCM SDK и managed runtime: результаты

Проверки 2026-11-14, финальная локальная перепроверка 2026-11-15. Реализованы
[design](design.md) и [plan](plan.md). Текущий контракт находится в
[managed-runtime](../../dotnet/managed-runtime.md), публичная инструкция — в
[руководстве](../../../docs/guides/dotnet.md).

## Что изменилось

`WshcmApi` в ws-client владеет файловыми/XML/XQuery операциями, input/response
validation, BS bridges и read grants. MCP регистрирует tools и адаптирует ответы.
API принимает evaluator и не управляет его lifecycle; его может использовать CLI.
XML остаётся XML, query JSON передаётся без повторной сериализации чисел.

Готовый npm ws-client включает только production RuntimeBootstrap/FileSystem DLL,
deps.json и manifest. Registry install не собирает C#, не требует локального SDK
и не скачивает отдельные ZIP. Source build/pack использует SDK из global.json.
Первый файловый вызов автоматически подготавливает DLL. `runtime.ensure()` и
`wshcm_runtime_status` возвращают отдельно expected, installed и loaded identity.
Неготовый runtime блокирует файлы, сохраняя доступность XML/XQuery.

`restart_required` сообщает о другой сборке в памяти; нужные bytes могут быть
уже установлены рядом. Автоматического restart, unload и замены mapped DLL нет.
Более новый совместимый runtime не откатывается. Совпадающая версия с другим
MVID остаётся BuildConflict, а не молчаливой заменой бинарного содержимого.

## Проверенные артефакты

[Финальный manifest, hashes и receipt](observed/final-artifacts.json) сохраняют
идентичность bundle и источников, а также read-only проверку установленного DLL
после остановки контейнера. В репозитории нет vendor assemblies и CLR.

| Компонент        | Version / API     | MVID                                   | SHA256 DLL                                                         |
| ---------------- | ----------------- | -------------------------------------- | ------------------------------------------------------------------ |
| FileSystem       | 0.1.0-alpha.4 / 2 | `646a1a84-313d-4189-8af6-ec2dd4c1234d` | `d97fffe1a4b66a88688e17b3e0751af50ecbecae0622d524bf6476d093742b5f` |
| RuntimeBootstrap | 0.1.0-alpha.1 / 1 | `29559c79-d1ae-454b-b219-0f1cef85caa9` | `0840a8f36f2cf6922d56139366848b00dc08e7c8d74993e01e24a0aedf0e3c30` |

Actual simple name helper заканчивается на
`B53a9ea0c1f41b578b4bb88a9389553a72996846f7a15fed29f0c3358e12525a0`.
Suffix — SHA256 seed build, а не hash окончательного именованного DLL.

## Native C-runtime

Существующий изолированный Linux stand `boristype-c-runtime-net9-wt-1`:
`websoft/hcm:2025.2.1333`, image ID
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`,
CLR 9.0.11, PostgreSQL 16. Carrier — SOAP evaluator во временной библиотеке,
для файловых e2e — stdio MCP → shared SDK → SOAP → BS → .NET.
Node environment proxy отключался только для отдельных локальных запусков.

До прерывания окружения в этой реализации прошли:

- [primitives.bs](primitives.bs): AppDirectoryPath/FilePath, создание owned root,
  PutFileData/Base64Decode → LoadFileData/Base64Encode, MoveFile create/overwrite,
  удаление fixtures. Результат: binary round trip и обе формы move успешны,
  итоговые bytes `xyz`. Это наблюдение Linux, не переносимая гарантия overwrite.
- [Native fixture probe](native-runtime-probe.mjs): свежий компонент V1 загружен
  как ready; update V2 подготовлен, но V1 остался в памяти; получен
  restart_required с разными actual installed/loaded MVID. Файловый вызов
  заблокирован, `sql: SELECT 1` через XQuery продолжил работать.
  [Raw result](observed/native-runtime.result.jsonl).
- Production FileSystem автоматически установлен в собственный managed root
  под `dotnetcore/shared`, после чего файловые MCP серии прошли **29 + 3 = 32**
  теста: операции с файлами, edit, read-aware guards и search. Проверялись
  installed hashes, реальные bytes через Docker и очистка fixtures/evaluator.
  FileSystem был именно alpha.4 с MVID/hash из таблицы выше.

Успешная fixture-проба использует отдельное имя assembly для каждого запуска.
В сохранённом raw result её base bundle ещё содержит промежуточную FileSystem
с MVID `35dff3ed-29be-4056-bf23-3d670177182a`: эта проба **не выполняла**
FileSystem, а собирала собственные V1/V2. Её нельзя выдавать за native acceptance
этого промежуточного FileSystem DLL. Финальный producer восстановил исходные
production bytes из таблицы, что отдельно проверено по установленному файлу.

[Cleanup receipt](observed/fixture-cleanup.json) подтверждает удаление обоих
owned fixture roots и отсутствие прежнего произвольного AppDir root. Production
`.boristype-runtime` сохранён намеренно. Загруженные fixture assemblies оставались
в процессе до его завершения; удаление диска не означало unload.

После последнего прерывания окружения HCM и PostgreSQL обнаружены в состоянии
Exited (255). Финальный повторный live прогон не выполнялся. Контейнеры не
запускались, их configuration не менялась. Read-only `docker cp` из остановленного
контейнера подтвердил active marker и SHA256 production DLL, совпадающий с новым
bundle; это проверка сохранённых файлов, **не** актуального loaded state.
Настоящий restart recovery HCM не аттестован; managed suite использует новый ALC.

## Обнаруженные ошибки и решения

1. Произвольный root под AppDirectoryPath не принимается RegisterLibDir.
   По [исследованию загрузчика](loader-research.md) и
   [уточнению пути](loader-paths.md) выбран настроенный `dotnetcore/shared`.
   GetAssembly использует simple name; отсутствующий target заранее не пробуется,
   потому что resolver может закешировать null.
2. C-runtime повторно объявляет `var` внутри следующей итерации цикла bootstrap.
   Переименование переменных не помогло; объявления вынесены перед циклом.
   BS try/finally без catch здесь отвергнут; native probe содержит явный catch.
3. Идентичность loaded module нельзя получать хешированием Assembly.Location:
   файл на диске может уже измениться. Используется MVID assembly из памяти ALC.
   Внешняя загрузка не подчиняется install lock: после staging и при последнем
   FileLoadException loaded state перечитывается. Реальный race покрыт managed test.
4. Ранний metadata-check пропускал ложные version/API/TFM при правильном MVID.
   Теперь один execution-free PE reader проверяет все эти поля до публикации;
   его же использует build-time identity tool.
5. Package schema не должна отвергать диагностический loaded API 0/500 или
   четырёхкомпонентный AssemblyVersion. Observed identity отделена от строгих
   expected/installed descriptors; причина несовместимости теперь сохраняется.
6. После clean solution/ZIP build producer мог использовать cached obj/bin,
   собранные с другими debug/documentation options. Реальный relocation test
   поймал разные MVID/hash. Publish теперь использует отдельный временный
   `--artifacts-path` для seed, final helper и компонента. Проверка ZIP, затем
   bundle, затем bundle из другого checkout сравнивает полные manifests.
   PathMap ограничен новым RuntimeBootstrap: добавление его к существующему
   FileSystem само меняло build identity без изменения исходников. Его удаление
   не воспроизвело отличие между checkout в текущем DebugType=None режиме;
   это не объявляется доказанным cross-checkout багом прежнего FileSystem.
7. Пакет с корректными hashes, но ложным MVID в manifest мог пройти release
   inspection. В SDK-equipped pack job проверяются реальные PE metadata обеих
   DLL из exact archive. Поздние publish/verify jobs используют его SHA512 и
   проверяют inventory/hashes. Actual archive regression меняет только MVID,
   оставляя DLL bytes/hashes нетронутыми, и требует отказа.
   Отдельно воспроизведён cache restore без bin/obj metadata-reader: strict
   inspection раньше падал на отсутствующем инструменте. Теперь он собирает
   trusted reader во временном artifacts/output root один раз на archive,
   очищает его и не зависит от неучтённых outputs. Реальная archive regression
   прошла при временно убранном исходном bin каталоге; каталог восстановлен.
8. Fixture projects вне solution собирались в Debug при clean Release build,
   а tests копировали Release outputs. Все четыре fixture-проекта включены
   в solution; чистая сборка и 122 managed tests прошли.

Повторная проба с фиксированным именем старой fixture правильно обнаружила
новую сборку против закешированной старой: [raw mismatch](observed/repeated-fixture-build-mismatch.result.jsonl).
После этого native harness стал публиковать уникальный actual simple name,
а не переименовывать существующий DLL.

## Локальная проверка и воспроизведение

SDK/Node/pnpm выбираются из global.json, .node-version и package.json. Проверено
локально на Linux; Windows job только подготовлен, его результат не утверждается.

```sh
pnpm test:dotnet
pnpm test:dotnet:pack
pnpm --filter @boristype/ws-client build
pnpm --filter @boristype/mcp-server build
pnpm --filter @boristype/ws-client --filter @boristype/mcp-server test
pnpm --filter @boristype/mcp-server test:pack
pnpm release:test
pnpm lint
pnpm format:check
pnpm docs:test
pnpm docs:check
pnpm docs:build
```

Проверено: **122 managed**, **127 SDK + 168 MCP**, **33 release**, **2 .NET packaging**
tests; actual npm archive/default resource resolution, corrupt bytes/false PE
identity, isolated relocated builds и thin MCP tarball smoke. Lint — 0 errors,
11 существующих warnings в compiler sources. Независимые reviews extraction,
installer, SDK/runtime и packaging завершены; замечания выше исправлены.

Skill `boristype-mcp` обновлён: агент использует runtime status/автоподготовку,
не предлагает отдельную установку DLL и сохраняет независимость query/XML.
Bounded baseline с прежней reference предлагал ручную установку; после изменения
reference independent read-through выбрал корректный workflow. Это проверка
инструкции, не native evidence. Структура skill проверена quick_validate.py.

Native fixture harness требует отдельно предоставленного действующего stand,
собранных SDK/bundle, .NET SDK и WSHCM_HOST/WSHCM_USER/WSHCM_PASSWORD. Он не
разворачивает стенд и не очищает server root автоматически: имя конкретного root
печатается для проверяемой отдельной очистки. File e2e описаны в README MCP.

## Остающиеся границы

Windows HCM, настоящий restart recovery, все варианты DOTNETLIBS-PATH и cluster
не подтверждены. Gate и файл — разные SOAP requests, process affinity нет.
Timeout не отменяет server operation; неизвестный mutation outcome не повторяется.
Защита от внешнего filesystem TOCTOU, определение cluster readiness и безопасная
автоматическая очистка старых loaded versions не добавлены. Конкретные следующие
проверки находятся в [TODO](../../../TODO.md).

По дополнительной подсказке пользователя отдельно исследована
[Websoft.Code.dll и несколько линий OmniCode](websoft-code.md). Это статическое
исследование editor/console backend, включая first-use writes и выполнение кода;
новые вызовы OmniCode в SDK не добавлены.
