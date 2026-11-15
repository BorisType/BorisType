# Websoft.Code и варианты OmniCode: статическое evidence

Дата: 2026-11-15. Исследован поставляемый артефакт, без CLR-загрузки,
HTTP/evaluator/WebSocket-вызовов или сборки .NET. Контейнер
`boristype-c-runtime-net9-wt-1` находился в `exited`, exit code 255;
его не запускали и не меняли. Копии vendor-файлов и полное REA evidence
остались вне git в `/tmp/bt-websoft-code-research/`.

## Вывод для SDK/MCP

DLL предоставляет серверную сторону редактора кода: дерево объектов,
чтение/сохранение кода, запуск объектов, параметры `wvars`, удаление и
WebSocket-консоль. Это кандидат для отдельного **object-aware** API поверх
каталогов и приложений HCM: он учитывает поля `exec_code`, `code_url`,
`code_text`, `code_type`, `wvars` и привязку к приложению.

В исследованных публичных entry points и их call edges нет provisioning,
проверки MVID или обновления DLL. Оснований заменять ими installer ws-client
нет. Контракт отличается от physical-file tools: сохраняются документы БД
и иногда файлы, присутствуют платформенные callbacks и Request/Session.
Поддержка readToken/hash-precondition, ограничений работы/ответа и изоляции
параллельных пользователей этим разбором не установлена.

## Идентичность и воспроизводимость

Источник: `/WebsoftServer/dotnetcore/libs/Websoft.Code.dll` из остановленного
контейнера. REA `inspect_managed_artifact` / `inspect_managed_members`:
metadata и CIL coverage complete, issues отсутствуют.

| Поле                     | Значение                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| Размер                   | 50 176 bytes                                                       |
| SHA256                   | `93de039e42d85b7ced1a9a5df89a58e561d106068693c84b4ccb1a00ec75d3b5` |
| Assembly                 | `Websoft.Code`, version `2.25.11.26`                               |
| MVID                     | `b3040a45-746e-40d3-82ec-c37346c3acc8`                             |
| Framework / architecture | `.NETCoreApp,Version=v9.0`, AnyCPU, managed CIL                    |
| Public-key token         | `993b6e642e45502b`                                                 |
| Metadata inventory       | 35 types, 177 methods, 20 assembly references                      |

Artifact evidence: `ev_f6afc6ce14381bd375f7e4803938313019ceb06172e932868252b7a038e8e4b3`.
Members/call edges/CIL evidence:
`ev_3f02601dbfd65620df59e5ef155c2de30477f33794deb8d18f8145ed0f15bdfe`.
Полный export: `/tmp/bt-websoft-code-research/rea-evidence.json` (1 617 345 bytes).
Токены ниже действуют только вместе с указанными SHA256/MVID.

Assembly references включают `Datex.Global`, `Datex.XHTTP`, `Datex.Core`,
`Datex.log` version `2.25.10.15`, а также System.* version `9.0.0.0`.
Их успешное runtime-разрешение не проверялось. Соседний `Websoft.Code.deps.json`
(SHA256 `90dc939014a426e3aec7d1f0d36e6cae6cda282e19146a8747fadb1b3cd85e35`)
называет проект `Websoft.Code/1.0.0`; этот номер не равен AssemblyVersion.

## Публичная поверхность и действия

Основные public static методы получают `Datex.Global.DatexGlobal context`:

| Entry point                                 | Token        | Статически наблюдаемое назначение                                            |
| ------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `wsft.Serve(context): bool`                 | `0x06000068` | HTTP dispatcher по `Request.Query.action` / `value`; пишет JSON в Response   |
| `wsft.ConsoleWatcher(context): bool`        | `0x06000071` | Создаёт/запускает Task; подписка на output текущего процесса                 |
| `WTConsole.AcceptWSConnect(context): bool`  | `0x06000075` | Регистрирует socket, перенаправляет process-wide `Console.Out`               |
| `WTConsole.ProcessWSConnect(context): void` | `0x06000076` | Полученный непустой текст передаёт `StaticPrime.ExecuteShellCommand(string)` |
| `WTConsole.CloseWSConnect(context): bool`   | `0x06000077` | Удаляет socket; при последнем подписчике восстанавливает stdout              |

Также публичны `JsonExtensions.Get` и `BufferedConsoleStream`; это служебные
JSON/stream primitives. Внутренние операции ниже private static, прямым
публичным строковым ABI они не являются.

`Serve` (IL 386–500) маршрутизирует:

| action   | Метод                               | Существенные call edges                                                                                           |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `get`    | `GetObjectCollection`, `0x0600006a` | XQuery, OpenDoc, File.OpenText; JSON с id/code/name/access/data/code_type/wvars/is_std                            |
| `post`   | `SaveObject`, `0x0600006d`          | OpenNewDoc/OpenDoc, XmDoc.Save/BindToDb, File.WriteAllText; `tools_vscode.add_in_application` через dynamic proxy |
| `start`  | `ExecObject`, `0x0600006e`          | Session.Env и `tools_vscode.execute` через dynamic proxy                                                          |
| `wvars`  | `SaveWVars`, `0x06000070`           | JSON Request.Body, изменение документа, XmDoc.Save                                                                |
| `delete` | `DeleteObject`, `0x0600006f`        | DatexGlobal.DeleteDoc                                                                                             |

Доступ зависит от `design_vscode_access`, `design_vscode_save_default`,
Session.Env.curUserID, признака администратора и прав приложения. Статические
defaults (`wsft..cctor`, `0x06000073`) содержат `database`, `full`,
`read_only`/`read_exec`/`all` и operation codes
`vsc_ro_access`/`vsc_re_access`/`vsc_all_access`. Это defaults кода,
не доказательство текущей конфигурации или обхода авторизации.

**GET не гарантирует отсутствие записи.** `Serve` всегда вызывает
`setConfiguration` (`0x06000063`, IL 65) до dispatch. Если
`<AppDirectoryPath>/vscode_config.json` отсутствует, тот сериализует defaults
и вызывает `File.WriteAllText` (IL 987–1109). При file save mode `Serve`
также вызывает `initCodeFolder` перед разбором действия. Поэтому этот endpoint
не использовался как read-only probe.

Private `wsft.UrlToFilePath` (`0x0600006b`) выполняет Trim,
Replace(`x-local://`, empty), Replace(`/`, `\`) и Path.Combine с AppDirectoryPath.
Это собственное преобразование, а не платформенный VFS resolver; на Linux
backslash остаётся отдельным вопросом совместимости. Запуском это не проверено.

`curUserID`, `curSessionAccess`, Catalogs и ApplicationAccessList — static
поля. Корректность конкурентных сессий требует отдельной проверки; один факт
static-полей не доказывает race или раскрытие данных. Консоль меняет общий
stdout процесса и исполняет команды, поэтому её нельзя включать в обычный
smoke чтения/файлов.

## Подтверждённая связь с установленными скриптами

Только статические disk-файлы, не database-backed URL blobs:

| Путь под `/WebsoftServer/`          | Evidence                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wt/web/wftwt/serve.html:3–6`       | user_init, `tools.get_object_assembly('Code')`, `CallClassStaticMethod('Websoft.Code.wsft','Serve',[])`; SHA256 `cc5cf961e121dc9d4d8916a0a1b524fa1f18f7eab5612fd96bf82ebceea61b7a` |
| `wtv/wtv_tools.xml:22355`           | mapping `Code` → `Websoft.Code.dll`; SHA256 `1addfe3642811ad749210580b251c62a318ccca2cab8b396470c4bc13348fc5b`                                                                     |
| `wtv/wftws/console_service.js:1–81` | accept сначала CheckSecurityContext, иначе tools_web.user_init; затем вызовы трёх WTConsole methods; SHA256 `5d3cef1ee508edd28c97463a680781932acd4e6e051152db5d04cf3a36136ff6`     |
| `wtv/wtv_tools_vscode.xml:6–179`    | execute/start_agent/evaluate/EvalCodePage; add_in_application; get_catalog_param; SHA256 `881789ed995615d1c70afcf12d51ac6d500803cb83810a70bb7a304b334ba58e`                        |
| `wtv/wtv_view_main.xml:21`          | LOAD `wtv_tools_vscode.xml`; SHA256 `ff768c0c0e3ce8069f3fdbd9fbad01dfb6590d4ca86873da634949255c58b8d3`                                                                             |

`wt/web/token_issue_for_omnicode.html` и `token_redirect_for_omnicode.html`
проверяют prefix `vscode://websoft.omnicode`; токены не выпускались, содержимое
credentials не читалось. Наличие wrapper-файлов не подтверждает доступность
маршрута, middleware registration, права текущего пользователя или успешность
callback на этой ревизии.

Ограниченный поиск читал regular static files до 1 MiB с расширениями
js/bs/html/xml/xmd/json: wt 3296, wtv 2438, components 620, platform 56,
app 49. Отдельная полная инвентаризация имён под components/platform не нашла
`websoft_omnicode`, `websoft_dotnetbuild` или путей с OmniCode. Это не поиск
в БД, остальных корнях или отдельно поставляемых архивах.

## Исторические варианты: что действительно известно

Проверена **одна** DLL. Бинарные различия других вариантов не установлены.
Документация, найденная через wshcm-docs, различает линии поставки:

- [Монолитная инструкция](https://wshcm-docs.boristype.dev/news/monolith/7009742607918425905.html)
  (создана 2024-03-25, обновлена 2026-09-04): отдельные
  Websoft.DotNetBuild/Websoft.OmniCode в `components`, пример архива
  `components_websoft_omnicode_24102024_1.24.10.24.zip`, SDK по версии HCM
  (net6/net9), token-based синхронизация. Cluster component creation не поддержан
  по этой статье. Номер архива — пример документации, его bytes не получены.
- [Платформенная инструкция](https://wshcm-docs.boristype.dev/news/platform/7165801003752482207.html)
  (создана 2025-06-09, обновлена 2026-07-22): компоненты в
  `platform/websoft_dotnetbuild` / `platform/websoft_omnicode`, net9,
  IS-PLATFORM и работа с компонентами/namespace. DotNetBuild отвечает за
  компиляцию, OmniCode — за редактор; это не роли, доказанные для данной DLL.
- [Описание SSJS с 2023.2](https://wshcm-docs.boristype.dev/news/monolith/7009835878503386358.html)
  говорит о создании/запуске агентов, выборок и remote actions, но отладка
  заявлена только для C#. Статья не задаёт wire protocol.

Эти статьи позднее поставляемой сборки/могли обновляться. Нельзя автоматически
приравнять найденный legacy `wftwt`/Websoft.Code к современному component API
или перенести требования установки между линиями.

## Следующие ограниченные проверки

1. Получить точный архив/VSIX нужного варианта и revision, затем execution-free
   сравнить identities, маршруты/handlers, auth и protocol с этим baseline.
   Это устранит неопределённость версии до разработки SDK adapter.
2. На отдельно разрешённом работающем dev-стенде сначала проверить наличие
   `vscode_config.json` и реальный backing store/route/auth без вызова Serve.
   Не запускать остановленный контейнер ради этой записи.
3. После явного выбора контракта и учёта first-use writes: один authenticated
   `action=get` для заранее известного fixture-объекта, bounded response,
   сравнение DB-backed code и file-backed code. Зафиксировать права,
   Unicode/BOM, JSON envelope, ошибки/лимиты и фактические побочные изменения.
4. Write/start/delete/console — отдельные fixtures и отдельная область проверки;
   до adapter нужны preconditions, concurrent-session и cancellation semantics.
   Console.ProcessWSConnect и Datex callbacks не входят в первый smoke.

Текущий ws-client provisioning/status остаётся самостоятельным контрактом.
Из этого исследования не следует runtime acceptance OmniCode на Linux,
Windows, другой версии HCM или в кластере.
