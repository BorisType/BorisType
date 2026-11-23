# Выполнение серверного BorisScript

Контракт: [SDK](../../packages/ws-client/README.md#выполнение-borisscript),
[MCP](../../packages/mcp-server/README.md#выполнение-серверного-borisscript).
`WshcmApi.execute({code})` использует существующий evaluator, MCP tool
`wshcm_execute` отвечает за JSON presentation и `isError`.
Компилятор TS→BS и managed file runtime не участвуют.

## Решение и границы

Запрос нужен для библиотечных вызовов и небольших диагностических скриптов.
Код передаётся строковым литералом в локальный native `eval`: `return` может
вернуть значение, `print(value)` складывает сообщения в буфер этого вызова.
На C-runtime отдельная функция вызывает eval, внешний try/catch получает
и результат, и native исключения, сохраняя ранее собранный вывод.
Возвращаемый carrier отделён от пользовательского значения; ошибки выполнения
и преобразования результата имеют разные phases.

`print` сохраняет строку, иначе использует EncodeJson, а для undefined —
буквальный текст `undefined`. Числа не преобразуются через String/concat:
у них [есть известная signed formatting граница](xquery.md#где-теряются-значения).
print возвращает свой аргумент, как native alert, но не пишет в общий журнал.
Внешний alert не переопределяется, глобальные sinks не переключаются. Пользователь
выбрал отдельное чтение штатных логов доступными средствами, сейчас через Docker;
новый инструмент не требует Docker и не объявляет полный захват library logs.

Shared value projector/decoder вынесены из XQuery в
[value-projection.bs](../../packages/ws-client/resources/value-projection.bs) и
[value-projection.ts](../../packages/ws-client/src/value-projection.ts).
Семантика XML/date/ordinary values сохраняется; XQuery оставляет свои envelope,
whole-row truncation и presentation policy. Это внутренняя проекция, не новый
публичный DSL значений или полный XML API. SDK сохраняет bigint и undefined,
MCP выдаёт safe integer number/large decimal string и undefined → null.
Nonfinite real в MCP даёт presentation error с прежней диагностикой.

Native исключения возвращаются как `{ok:false,error:{phase,message},output,...}`,
в MCP с `isError:true`; SDK их не выбрасывает. Ошибка в phase `result` означает,
что пользовательский код уже завершился, но результат не удалось выдать.
Transport/невалидный carrier выбрасывает `WshcmExecutionError` с неизвестным
исходом; при потерянном ответе нельзя обещать ни сохранность вывода, ни отсутствие
изменений. Платформенный контекст ошибки сохраняется до 2000 символов.
Нельзя приписывать ему точные JS stack/source maps, которых HCM не предоставляет.

Limits: code 64 KiB UTF-8; projection depth 32/10000 values/48000 carrier
characters; diagnostics 256 messages/16000 JSON-encoded characters; final
response 256 KiB UTF-8. Diagnostics отбрасывает целые последующие сообщения,
выставляет outputTruncated и продолжает код. Результат целиком отклоняется
через phase result при native projection limit. Клиентские invalid/oversized
responses имеют неизвестный исход. Эти проверки не ограничивают память/работу
кода: значение или сообщение формируется до проверки размера.
Как и у [system info](system-info.md#carrier-и-границы), native EncodeJson/SOAP
не аттестован для произвольных C0 controls; неподдерживаемый binary carrier
даёт явную ошибку, не обход codec.

Выполнение имеет права аккаунта и доступ к серверным API, не изолирует код
и не наследует readToken ограничения файлового API. Это намеренно произвольное
выполнение, с readOnly=false/destructive=true/idempotent=false hints.
Не добавлены retry, rollback, jobs/cancellation или timeout как server kill.
Обычный transport timeout остаётся настройкой клиента, без нового input флага.
Общий evaluator lifecycle сохраняется; native runner ожидает подтверждения
завершения своей bounded timeout-пробы до удаления её файлов/evaluator.
Общий shutdown при произвольном in-flight SOAP остаётся существующим долгом.

## Журналы сервера и балансировка

Для планируемого `wshcm_get_server_logs` согласовано ограничение охвата.
Текст для описания инструмента:

> Each call lists, tails, or searches logs on the HCM node serving its SOAP request.
> When using a load balancer, consecutive calls can reach different nodes, including
> a list request followed by a tail request for the same filename. Treat every
> response as local to the serving node. A missing match is inconclusive for the
> cluster. Connect directly to the relevant worker node for agent execution logs
> or to the relevant web node for web request logs.

Первая версия рассчитана на диагностику одной ноды. Все фрагменты одного поиска
должны читаться на той же ноде. Кластерное ограничение действует для всех режимов,
даже если поиск по выбранной ноде завершился без усечения.
[Документация HCM о журналах нод](https://wshcm-docs.boristype.dev/news/monolith/7234153256332551015.html)

Варианты для дальнейшей работы:

- **Прямое подключение.** Сейчас адрес нужной ноды можно задать через
  `WSHCM_HOST`. При нескольких доступных адресах можно добавить именованные
  источники в конфигурацию MCP и выбирать ноду параметром вызова.
  [Конфигурация MCP](../../packages/mcp-server/README.md#конфигурация)
- **Закрепление сессии.** Если балансировщик поддерживает affinity для SOAP,
  проверить маршрутизацию последовательных вызовов и возвращать проверенный
  идентификатор обслужившей ноды. При переключении backend начатый просмотр
  нужно считать прерванным. Охват такого просмотра составляет одну ноду.
- **Поиск по кластеру.** Для настроенного списка нод можно выполнять поиск на
  каждой и возвращать статус опроса и источник каждого совпадения. При наличии
  централизованного сборщика можно использовать его как источник поиска с
  метками ноды и роли. Полноту ответа определяют доступность источников и
  задержка доставки записей.

## Статус print

Уточнение пользователя 2026-11-17: необходимость отдельного `print` вызывает
сомнение, но пока его следует оставить как экспериментального кандидата.
Работоспособность функции проверена native тестами; это не подтверждение её
практической полезности. Нужно сравнить реальные диагностические сценарии
с `return` структурированных данных и отдельным чтением штатных логов HCM,
в текущем доступном окружении — через Docker. По результатам решить, сохранить,
изменить или удалить функцию. Работа по оценке записана в [TODO](../../TODO.md).
Текущее поведение не меняется; экспериментальный статус относится именно к print.

## Источники

- [eval()](https://wshcm-docs.boristype.dev/datex/common/5620250451197911778.html#eval):
  выполнение в текущем окружении с отдельным уровнем переменных.
- [alert()](https://wshcm-docs.boristype.dev/datex/common/5620250451197911685.html#alert):
  сервер пишет в xhttp, возвращает аргумент; это не sink HTTP ответа.
- [wshcmx/types, revision 1d76d40](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/core/index.d.ts):
  eval:3458, alert:3774, EncodeJson:3896, Sleep:4286 (миллисекунды).
  Сигнатуры/описания не заменяют native semantics; проверка ниже относится к
  конкретной C-сборке. Статья `EvalCode()` в поиске описывает Thread.EvalCode,
  поэтому для этой реализации не использована как reference глобального eval.

## Native проверка 2026-11-17

Linux C `websoft/hcm:2025.2.1333`, image
`sha256:0edeac24afc2a5371ea8431c59b1c17ca2b1a9e5a3768275cfdb5023609e34ab`,
тот же запущенный PostgreSQL-backed stand, что в system-info acceptance.
Источник: [test:e2e:execute](../../packages/mcp-server/test/e2e/execute.mjs).
Пройдено **10/10 Node tests** (9 сценариев + parent), без skips:

- library call с независимым SOAP version oracle;
- signed/large integer, real, CRLF/CR/tab/Unicode, placeholder-like text;
- print(-7) с правильным знаком, возврат аргумента и undefined;
- syntax/runtime error с ранее собранным выводом и native context;
- message/character truncation с продолжением кода;
- oversized/cyclic result как result error после выполнения;
- XML repeated fields/date projection;
- nonfinite MCP presentation error с выводом;
- реальное продолжение кода после client timeout.

Timeout-проба: requestTimeout 150 ms; native код пишет started-маркер,
делает Sleep(1200) и пишет finished-маркер. SDK получил transport error с
`executionStatus:unknown`; независимое Docker чтение затем подтвердило completed.
Не было execution retry. Собственный каталог с обоими маркерами и evaluator
удалены, отсутствие подтверждено. Бизнес-записи, настройки, CLR/DLL и контейнеры
не менялись; сервер не перезапускался.

Oracle вызывает `tools.get_version("wtv", false)` с обоими явными аргументами:
на этом стенде default bDateFlag при прямом BS вызове и при SOAP с одним аргументом
дал разные результаты (с датой и без). Это не исправлено в платформе и не скрыто
новым инструментом. Native eval с `return` проверен; JS IIFE wrapper на C не
поддержался и в продукт не включён.

После extraction общий XQuery native runner прошёл **12/12**, без skips,
включая large Unicode/output boundaries. Unit SDK tests используют явные
synthetic carriers для validation/decoding; они не выдают JS eval за C-runtime.
Старые VM XQuery tests продолжают выполнять реальный shared projector с doubles.
Полные Node suites: SDK **235/235**, MCP **183/183**; сборки обоих пакетов,
MCP tarball smoke, targeted ESLint, Prettier, syncpack и docs checker прошли.
Transport error messages дополнительно ограничены 2000 UTF-16 units с коррекцией
оборванного surrogate, чтобы и ветка ошибки укладывалась в response budget;
регрессия с 300000-символьным сообщением сначала воспроизвела переполнение,
затем прошла после исправления. Независимое ревью не оставило блокирующих findings.
Windows HCM, другие версии/локализации, arbitrary long-running code и полное
перехватывание штатных журналов этой проверкой не аттестованы.

## Запуск существующего серверного агента

`wshcm_run_agent` использует метод формы `TopElem.run_agent` и проверяет
`TopElem.obj.Object.IsRunning` у потока этого вызова для синхронного ожидания.
Метод в поставляемом `wtv_server_agent.xmd` переносит `wvars` в параметры
потока. Для конкретного запуска SDK обновляет объявленные значения в открытом
документе без Save. В `wtv_server_agent.xms` встречаются прямой вызов метода
формы и `tools.start_agent`. Второй маршрут может ставить запуск в очередь
на web-role. Текущий инструмент поддерживает standalone HCM.
[Datex start_agent](https://wshcm-docs.boristype.dev/news/monolith/6680802585513428903.html#start-agent)
[wshcmx/types, серверный агент](https://github.com/wshcmx/types/blob/1d76d40c87ad6a9c249bd16f1bfea035dd815940/lib/xml/server_agent/index.d.ts#L25)

Native проверка 2026-11-19 на Linux C-runtime 2025.2.1333 через SDK и
MCP stdio: sync вернул `ended`, асинхронный вызов вернул `accepted`.
При ожидании 100 мс MCP вернул `wait_timeout` через 106 мс, затем агент
записал маркер окончания. Маркеры подтвердили точные ID больше `2^53`,
Unicode, CRLF и апостроф в параметре. Необъявленный параметр отклонён до
запуска. XML агента совпал до и после вызовов. Тестовый агент, маркеры и
временные evaluator удалены.
