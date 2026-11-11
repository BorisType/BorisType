# MCP transport, packaging и lifetime

`@boristype/mcp-server` — Node stdio server. Он использует ws-client/SOAP и
временную BS evaluator library; `wshcm-docs` — отдельный документационный MCP,
не этот пакет. TS собирается обычным tsc, BS resources написаны отдельно;
зависимости от compiler script/module и descriptor ABI нет.

`createServer(connection)` создаёт server с внешним connection без сетевого
подключения. Caller владеет connection/transport. CLI `startServer` создаёт
connection, подключает StdioServerTransport и обслуживает shutdown.
[server.ts](../../packages/mcp-server/src/server.ts) регистрирует девять файловых
tools, XQuery и три XML tools. Schemas/handlers — в
[tools](../../packages/mcp-server/src/tools/), templates — в
[resources](../../packages/mcp-server/resources/). Аннотации readOnly/destructive/
idempotent — hints клиенту, не механизм авторизации или обязательного UI approval.

## Что исправили исследования транспорта

Исходный аудит 2026-11-05 относился к прототипу `ec588a9595a5576d45ecd748b2302c2430e6f438`,
base main `ed8935d`. Его четыре handlers и семь registered stubs не описывают
текущий inventory. Существенные findings сохранены здесь по механизму:

| Риск и прежнее наблюдение                                                                                                     | Итог и сохранившаяся граница                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| SOAP parser trim/numeric coercion превращал `"  first\nlast  \n"` в `"first\nlast"`, `"000123"` в `"123"`, whitespace в empty | String VALUE-TYPE сохраняется отдельно от typed bool/integer/real, nested/Fault rules проверяются regression suite  |
| HTML login response без ResultData мог стать `undefined`, затем успешным `""`                                                 | Обязательные carriers требуют string; общий void/malformed SOAP envelope contract не стал полной strict validation  |
| package files не содержал runtime templates                                                                                   | Фактический tarball проверяет resources/import/CLI; список manifest сам по себе не доказывает startup               |
| replacement-string `replaceAll` раскрывал `$&`; literal newline ломал generated code                                          | Однопроходная замена с serializer escaping; payload `${other}` остаётся данными                                     |
| raw SOAP XML нормализовал CRLF/CR                                                                                             | JSON string carrier защищает точную текстовую строку; общий XML parser не восстановит уже потерянный CR             |
| request trailing whitespace исчезал до filesystem API                                                                         | Whitespace XML request маскируется numeric references; round trip проверялся native echo                            |
| UTF-8 HTTP chunks декодировались по отдельности                                                                               | `res.setEncoding("utf8")` сохраняет неполный символ; regression server дробит многобайтовый payload по одному байту |

[Native file e2e](../research/mcp/04-local-e2e.md) фиксирует pre-DLL наблюдения:
LoadUrlText UTF-8 без BOM давал CP1251 mojibake, DetectContentCharset не помог,
DecodeCharset(LoadUrlData,'utf-8') — помог. PutUrlText создавал BOM даже для
empty string. Нынешние files проходят strict UTF-8 DLL; старые templates/hashes
из этого отчёта не являются текущим кодом. Независимые Docker bytes были oracle;
вторая копия того же handler не была бы независимой проверкой.

## Lifetime и неизвестный исход

Даже read-only session загружает временный evaluator в `x-local://wt/`.
Закрытие удаляет его через `drop_self`. EOF, SIGINT/SIGTERM и transport startup
failure после создания connection используют общий idempotent shutdown.
`Evaluator.close() == false` — ошибка и ненулевой exit. Одновременный EOF/signal
не должен повторять cleanup. Эти случаи проверены в native lifecycle серии.

**Не закрыты** partial evaluator initialization и shutdown во время активного
SOAP request. Cleanup connection не является отменой уже выполняющегося BS.
После timeout/lost response сначала установить результат и состояние fixtures;
blind retry mutation не безопасен по самому факту ошибки клиента.
[Filesystem checkpoint](../research/mcp/08-filesystem-checkpoint.md) сохраняет
проверенный commit, независимый cleanup и эти открытые условия.

## SDK/dependencies и опубликованный artifact

Используется раздельная v2 линия `@modelcontextprotocol/server`/`client`,
StdioServerTransport импортируется из `server/stdio`, Zod schemas передаются
явным `z.object`/strictObject. Текущие версии — из
[manifest](../../packages/mcp-server/package.json)/lockfile: SDK ^2.4.0.
Переход сначала на legacy SDK 1.32.x, затем 2.3.1 с 14-дневным cooldown был
промежуточным этапом. Проверка только dist-tag старого имени пропустила stable
major с новыми package names. Для обновления нужны upstream release lines,
replacement names, engines/migration docs и repository supply-chain policy.

Источники migration:
[SDK README](https://github.com/modelcontextprotocol/typescript-sdk#readme),
[v2 guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2),
[npm server](https://www.npmjs.com/package/@modelcontextprotocol/server),
[npm client](https://www.npmjs.com/package/@modelcontextprotocol/client).
Документация main может описывать более свежий API; acceptance относится к
версии lockfile. [Датированный audit](../research/mcp/03-dependency-review.md)
сохраняет metadata и причины остаться на TS 6 Compiler API; его «latest» и
advisory status не являются свежей проверкой registry.

`test:pack` работает с настоящим tarball и workspace dependencies, проверяет
resources, отсутствие удалённых stubs, import/help/version. Это не fresh
registry install и не HCM connection. InMemoryTransport и subprocess stdio
проверяют initialize/list/call, unknown-tool InvalidParams, schema descriptions
и настоящий stdin/stdout с fake connection. VM выполняет настоящий BS template
с doubled platform/CLR. Ни один из них не доказывает C-runtime поведение.

Native `test:e2e*` требуют отдельного подготовленного Linux Docker stand,
совместимой установленной DLL для files/search, explicit credentials/container,
доступного IPv4/HTTP и эксклюзивного fixture scope. Они не разворачивают stand;
missing env — явная ошибка, не silent skip. Команды и prerequisites — в
[package README](../../packages/mcp-server/README.md). Для изменения prose
повторять HCM, crash/hang probes или устанавливать DLL не требуется.

## Что не следует восстанавливать из старых stubs

Прототип полагал, что MoveFile отсутствует и нужен text copy/delete. Но
[MoveFile documentation](https://wshcm-docs.boristype.dev/news/monolith/6722114747369980167.html#movefile)
и types core:2048 давали native API candidate; его binary/overwrite guarantees
тем аудитом не проверялись. Текущий managed move имеет собственный no-copy
contract. [ObtainDirectory](https://wshcm-docs.boristype.dev/datex/common/5620276892448878688.html#obtaindirectory)
описывает второй recursion argument; без него предположение mkdir-p не доказано.
В закреплённом [types core](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts)
были GetFileModDate/UrlFileSize, а не имена FileModDate/FileSize из TODO.
Отсутствие этих имён в declarations не доказывало их отсутствия во всех HCM.
[LoadUrlText options](https://wshcm-docs.boristype.dev/datex/common/7172076235998782839.html#%D1%81%D0%B8%D0%BD%D1%82%D0%B0%D0%BA%D1%81%D0%B8%D1%81)
не заменяли native BOM/charset проверку; helpers в
[types tools](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/tools/index.d.ts)
содержали unknown overload results, не подтверждение записи.

Старая feature-ветка также содержала duplicate htmlEntities в object literal
(TS1117), отсутствовавший в тогдашнем main. Перенос scoped MCP на новый main
предпочтён переносу старого root lockfile. Это исправленный исторический дефект,
а не текущее нарушение. Общий strict SOAP envelope, partial startup и in-flight
shutdown не объявлены решёнными самим dependency refresh.
