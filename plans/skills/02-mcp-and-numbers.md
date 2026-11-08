# MCP usage skill, server instructions и числовые ограничения

Дата: 2026-11-08. Пользователь согласовал один `boristype-mcp` skill и короткие
server instructions, затем попросил включить числовые наблюдения также в
независимый `websoft-hcm`. Текущая ветка — `feat/mcp-xquery`.

## Граница шага

`boristype-mcp` содержит entrypoint, UI metadata и два справочника:
файлы/readToken/хранилища и XQuery/SQL/потери типов/timeout. Устанавливается
отдельно, без зависимости от другого skill или checkout. Сами параметры
пользователь сверяет с актуальной schema сервера. MCP/DLL skill не устанавливает.

Общие server instructions передаются в initialize result. Resources/prompts
не добавляются: это отдельные возможности протокола, которые можно развить
позже. Хост решает, какие инструкции/ресурсы подать модели; доставка текста
не доказывает его использование и не усиливает гарантии tools.

Источники выбора механизма:
[server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/),
[resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources),
[prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts).

Числовые сведения в `websoft-hcm` должны оставаться независимыми от MCP:
наблюдаемый unsigned-like вывод, StrSignedInt, StrReal precision и SQL→XML.
Серверные наблюдения 2026-11-07/08 переиспользуются из
[native отчёта](../mcp-server/09-xquery-native.md); новых runtime гарантий нет.

## Проверки `boristype-mcp`

Независимые контексты, без сети, стенда и доступа к repository source.
Baseline получил шесть сценариев и snapshot публичных tool descriptions/schemas
с реализацией адаптеров. После авторства другой агент получил те же материалы
и только изолированную установленную копию нового skill.

Сценарии: чужой token и накопление двух reads; preview и whole-file overwrite;
SQL negative/null/empty и локализация; точный большой ID в Node; timed-out UPDATE;
дисковая правка при чтении SQL blob через LoadUrlData.

Baseline `/root/mcp_skill_baseline` уже корректно применил описания tools:
token chaining, явное полное чтение, lossless ID, отсутствие слепого retry.
Нельзя приписывать эту корректность новому skill. Reference gaps были в фактах
исследования: «the bundle does not identify its precise internal layer»;
«None of those specific behaviors is established by the supplied bundle»
о storage priority/import. Это недостаток доступного знания, не нарушение
дисциплины; новые запреты ради этих gaps не добавлялись.

`/root/mcp_skill_check` применил установленный skill во всех шести сценариях:
правильные proposed calls/новые tokens, preview не расширяет coverage,
документированная локализация до SOAP отделена от нового response alone,
CAST и lossless parsing, неопределённость timeout и условное SQL routing.
Material contradictions не обнаружены. Проверка содержательная, не regex
по формулировкам; один baseline и один follow-up не являются статистическим
измерением качества модели.

Технические проверки первого skill:

- `quick_validate.py`: valid (изолированный `uv --with pyyaml`, без новых repo dependencies).
- `skills@1.7.6 add <isolated-source> --skill boristype-mcp --agent codex --yes --copy`:
  установлен только выбранный skill, четыре файла совпадают побайтово.
- Все локальные ссылки установленной копии остаются внутри её каталога.
- MCP stdio characterization: до изменения `client.getInstructions()` был
  `undefined`, тест упал; после добавления instructions реальная инициализация
  передала непустую строку, list/call также прошли. Тест не сравнивает prose.
- MCP unit suite после добавления instructions: 151/151.

Raw skill application outputs остаются во временном research directory вне git;
выше сохранены условия и существенные выводы. Пользовательский `.agents/`
и global skills не меняются. Npx install выполняется в отдельном temp project.

## Числовое дополнение `websoft-hcm`

Добавлен `references/numbers-and-sql.md`; entrypoint и discovery description
маршрутизируют числовые вопросы в этот справочник. Включены без изменения
байтов три прежние native-пробы: вывод -1, знаковые formatters и constant SQL
mapping. SHA256 сверены с исходными native logs и таблицей справочника.
Транспорт запуска остаётся на стороне доступной тестовой установки;
обязательной зависимости от нашего MCP/компилятора нет.

Baseline `/root/numbers_skill_baseline` получил прежнюю копию `websoft-hcm`
и пять одинаковых offline вопросов. Он корректно обозначил отсутствие
числовых сведений: «No signed integer formatter is verified in the supplied
reference» и «There is no verified workaround in the supplied reference».
Конкретные actual значения, formatter и SQL mapping потребовали бы повторного
исследования. Это reference/retrieval gap, не ошибка арифметического рассуждения.

После отдельной установки `/root/numbers_skill_check` применил только новый
`websoft-hcm`, без `boristype-mcp`, веба, старых raw logs и checkout:

- Воспроизвёл конкретные результаты вывода, сравнения, EncodeJson и StrSignedInt.
- Различил точный integer formatter и округление StrReal на большом значении.
- Локализовал задокументированную SQL потерю до SOAP, предложил text cast,
  сохранил неопределённость внутренней причины и NULL marker contract.
- Сохранил границы Linux/C/PostgreSQL, не распространил результат на Windows,
  JS runtime, MSSQL или все signed 64-bit границы.
- Нашёл три probes, проверил hashes и отметил, что отдельный VARCHAR/control
  запуск не содержится в bundled SQL source; его actual описан в справочнике.

Все пять reference-сценариев получили конкретные ответы без превышения evidence.
Это один baseline и один независимый application pass, не benchmark модели.

`skills@1.7.6 add <isolated-source> --list` обнаружил два skills.
Выбор `--skill websoft-hcm --agent codex --yes --copy` установил только
`websoft-hcm`: все 13 файлов совпали побайтово, локальные ссылки остаются
внутри skill, три новых probe hashes совпали. Frontmatter обоих skills valid.
Новые server instructions проверены локальным stdio, поэтому на этом шаге
не было повторных native запусков, конфигурационных правок или рестарта стенда.

## Финальная проверка

- Сборки `@boristype/ws-client` и `@boristype/mcp-server`: успешно.
- Unit suites: ws-client 20/20, MCP 151/151, без skips/failures.
- `test:pack`: actual tarball resources/import/CLI smoke прошёл; это workspace
  dependencies, не fresh registry install и не HCM connection.
- ESLint для изменённого TypeScript source, полный Prettier check и
  `git diff --check`: успешно. MJS stdio test выполняется Node test runner;
  ESLint config workspace его игнорирует.
- VitePress docs build: успешно; прежние warnings подсветки `gitignore`
  относятся к существующим страницам.
- Независимое review новых skills, числовых фактов, server instructions и
  согласованности с tools: material findings нет.
- Оба stand containers остаются stopped, OOMKilled=false. Пользовательский
  `.agents/` не изменялся, новые npm/NuGet dependencies не добавлены.

Remote install новых файлов требует публикации ветки/merge; проверенная
установка здесь использует изолированный локальный источник. Коммит и push
в этот шаг не входят.
