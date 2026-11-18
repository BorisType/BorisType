# Native-проверка восстановления MCP

[Receipt](acceptance.json) получен на существующем Linux x64 C-runtime HCM
2025.2.1333, Ubuntu 24.04.3 LTS, PostgreSQL 16.16 и .NET 9.0.11.
Он связывает собранный CLI и SDK с исходниками и lockfile на время запуска.
`headAtRun` — текущий коммит при запуске. Изменённые исходники runner и package
script привязаны отдельными SHA-256. `wire` содержит тип операции, отметку
инъекции/доставки, HTTP status и хеши SOAP bytes. `sourceHashes` относятся к
прямым контрольным eval. Auth headers, cookies и содержимое ответов не записаны.

## Наблюдения

| Сценарий                                            | Фактический результат                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proxy offline, `initialize` / `tools/list` / `ping` | Тот же stdio процесс отвечает, 27 tools, 0 HTTP-запросов от CLI. Следующий execute получает `HcmUnavailable` / HTTP 503 / `not_started`, XML write получает `not_attempted`.                                                                                                                                                        |
| Отклонение авторизации на proxy                     | Инъекции HTTP 401 и 403 классифицируются как `HcmAuthenticationFailed`, `retryable: false`.                                                                                                                                                                                                                                         |
| Потеря ответа на первую загрузку evaluator          | Реальный HCM сохранил helper. Ответ CLI сообщает `not_started`. Два параллельных execute в том же MCP процессе разделяют login и safe probe, используют этот файл и выполняют оба скрипта.                                                                                                                                          |
| Повторный offline/online и package handles          | ZIP и sidecar доступны на диске MCP без запроса к proxy. Native проверка существующего inspection возвращает `HcmUnavailable` и сохраняет известный receipt. После восстановления действуют прежние artifactId, inspectionId и operationId.                                                                                         |
| Новый inspect при offline                           | CLI успел сохранить локальную копию ZIP и sidecar. Native preflight вернул `HcmUnavailable` без artifact ID. Копия обнаружена по файлам в каталоге этого запуска и вошла в подтверждённую очистку.                                                                                                                                  |
| Удаление только собственного evaluator              | HCM исполнил safe probe и пользовательский read-only код при отсутствующем файле. Затем proxy однократно подал SOAP Fault на safe probe и пропустил восстановление через HCM. Wire фиксирует одну повторную загрузку того же модуля по его URL и успешную проверку перед новым бизнес-вызовом. Readback файла совпадает по SHA-256. |
| Read grant и managed file                           | XML patch использовал token до outage и сохранил comment и custom field. Уже установленный FileSystem API 2 был готов и прочитал тот же файл. DLL и active marker сохранили byte hashes.                                                                                                                                            |
| Native ошибка и потерянный ответ мутации            | Исключение скрипта осталось native ошибкой. Отдельный скрипт дописал суффикс к имени собственного объекта. Proxy получил полный upstream response и оборвал ответ CLI. Исход в MCP `unknown`, прямой readback подтверждает ровно один суффикс, wire — один dispatch.                                                                |
| EOF и точная очистка                                | CLI вызвал `drop_self` один раз. Сверены восемь исходных evaluator. Удалён отдельный временный каталог с четырьмя парами ZIP/sidecar. Удалены owned cost_center, report и operation directories. `irsd` / `novyy` с нулём объектов и байты XML схем сохранились.                                                                    |

Proxy моделирует доступность HTTP и классы ошибок без изменения сервиса.
После удаления файла выполнение из cache продолжалось. Инъекция доказывает
recovery после pre-dispatch SOAP Fault. Наблюдения не покрывают живое
вытеснение module cache, перезапуск HCM, балансировку, Windows или MSSQL.

## Воспроизведение

Требуются pnpm и Node из manifests, эксклюзивный уже запущенный Linux Docker
stand с опубликованным локальным HTTP портом HCM, известные учётные данные и
доступ к Docker inspection. Подготовка runtime проводится в отдельном
процессе эксплуатации. Runner проверяет существующий bundle и active marker
перед managed операцией. При несовпадении installed bundle данный маршрут
пропускается. При `restart_required` evidence заканчивается статусом готовности
managed runtime. Runner не запускает и не останавливает контейнеры.

Из корня репозитория:

```sh
pnpm --filter @boristype/ws-client build
pnpm --filter @boristype/mcp-server build
WSHCM_CONTAINER=boristype-c-runtime-net9-wt-1 \
WSHCM_HOST=localhost WSHCM_PORT=80 NODE_USE_ENV_PROXY=0 \
WSHCM_MCP_RECOVERY_RECEIPT=/tmp/boristype-connection-recovery.json \
pnpm --filter @boristype/mcp-server test:e2e:connection-recovery
```

`WSHCM_USERNAME` и `WSHCM_PASSWORD` должны быть заранее заданы в окружении.
Прямой SDK направляет контрольные вызовы на HCM и очищает только ресурсы
текущего запуска. Бизнес-вызовы CLI идут через loopback proxy. Cleanup использует
точные UUID, имя helper и marker объекта. CLI получает отдельный каталог
`mkdtemp` через `--package-artifact-directory`. Очистка удаляет этот каталог
целиком. ZIP из обычного пользовательского каталога не участвуют в пробе.
Package schema XML сравнивается до и после. Native cleanup не удаляет download
records по ID из архива. SQL fallback, import и редактирование package schema
не нужны.
Сохранённые [исторические XML receipts](../object-patch/README.md) относятся
к своим ревизиям.
