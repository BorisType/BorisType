# Переносимые знания и проверка skills

Пользовательские skills распространяются из [skills/](../../skills/README.md).
`websoft-hcm` хранит независимые знания платформы, `boristype-mcp` — сценарии
существующих tools, `websoft-hcm-admin` — проверенные маршруты браузерной админки.
Они устанавливаются выборочно, самодостаточны без checkout и соседних skills.
MCP/DLL/stand они не устанавливают. Runtime/сырой vendor source/credentials в
пакет не входят. Checkout-local developer workflow имеет другую роль.

## Почему references отделены от транспорта

В websoft-hcm находятся paths/config, SQL routing/hydration и числовые
observations с собственными bounded BS probes. MCP skill объясняет exact URL
readToken chain, full overwrite, output limits/lossless IDs/unknown outcome.
Параметры сверяются с актуальной tool schema; prose не создаёт capabilities.
Наличие skill не добавляет x-app/file в file tools.

Initialize server instructions передают короткие общие ограничения. Resources/
prompts — отдельные protocol features и не добавлялись автоматически.
Host решает, какие instructions/resources получит модель; доставка текста
не доказывает применение или усиление гарантий. Источники выбора:
[server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/),
[resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources),
[prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts).
Локальный stdio characterization до instructions возвращал undefined, после
реальная initialize передавала непустой текст; test не сравнивал точную prose.
Это protocol evidence без нового HCM запуска.

## Что установили исторические проверки полезности

Серии 2026-11-06/08/10 использовали одинаковые offline questions до/после,
после — только изолированную установленную копию, без research checkout, сети
или стенда. Это единичные baseline/application passes, **не model benchmark**.
Сохраняется разделение: reference gap не является дисциплинарным провалом;
новый skill не получает заслугу за поведение, уже корректное в baseline.

| Серия / контексты вне git                                                    | Сценарии и вывод                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path `/root/skill_baseline` → `/root/skill_reference_check`                  | Пять вопросов: `%20`, x-local/x-app host, Windows sample/отсутствующий API, ini, server/x-sys-image. Baseline честно не знал native фактов; installed reference дал конкретные результаты и сохранил Windows/config unknowns                                     |
| storage `/root/storage_reference_baseline` → `/root/storage_reference_check` | Четыре вопроса о blob priority/import/DeleteUrl; новый reference дал ограниченные Linux/C/PostgreSQL ответы. Review добавил SQL/source/cleanup, чтобы не зависеть от raw research                                                                                |
| MCP `/root/mcp_skill_baseline` → `/root/mcp_skill_check`                     | Шесть сценариев: чужой token/two reads, preview/overwrite, SQL negative/null/empty, large ID, timed-out UPDATE, blob/disk. Baseline уже правильно применял token chain/lossless/no-blind-retry из descriptions; новый knowledge gap был в storage/numeric фактах |
| numbers `/root/numbers_skill_baseline` → `/root/numbers_skill_check`         | Пять вопросов: signed output/arithmetics, StrSignedInt, StrReal precision, SQL loss до SOAP/text cast, границы evidence. Reference дал actual values и hashes; отдельный VARCHAR control описан в reference, не входит в bundled SQL source                      |
| admin `/root/admin_skill_baseline` → `/root/admin_skill_check`               | API-created запись не находится по фамилии: установленный reference дал /admin, каталог, double-click, поля и снимки с учётом открытого пароля; baseline осторожен, но UI route/labels неизвестны                                                                |

Raw application answers хранились во временных внешних directories; это
locators, а не обещание доступного воспроизводимого artifact в checkout.
Runtime основания references сохранены отдельно в [paths/storage](paths-and-storage.md),
[XQuery/numbers](../mcp/xquery.md) и [object-model evidence](../research/mcp/10-object-model/README.md).
Новых native гарантий skill application не создаёт.

## Источники и installed artifact

Исторический CLI — `vercel-labs/skills` 1.7.6, revision
`d3701c11b1101251af14c9d148f026e1a47ebe17`:
[discovery](https://github.com/vercel-labs/skills/blob/d3701c11b1101251af14c9d148f026e1a47ebe17/docs/creating-skills.md),
[install flags](https://github.com/vercel-labs/skills/blob/d3701c11b1101251af14c9d148f026e1a47ebe17/docs/commands.md).
Во временных проектах `--list` обнаруживал нужные skills, `add --skill ...
--agent codex --yes --copy` ставил только выбранный. Проверяли frontmatter,
точные bytes каждого installed файла и разрешение локальных links внутри
installed directory, не только source tree. Исторические размеры комплектов:
websoft-hcm 6 файлов сначала, 9 после storage, 13 после numbers; boristype-mcp 4,
admin 3. Эти counts относятся к этапам, не текущему manifest. Пользовательская/
global установка и root .agents не изменялись.

Resolver/numeric/storage probes переносились с исходными hashes без изменения
bytes. Проверка содержала finite inputs, actual URL strings и caveat:
UrlHost/UrlPath в path-followup находятся вне try. Повторение source hash не
доказывает возможность запуска без внешнего carrier/runtime/config.

Конфигурационное дополнение к path reference читало server xHttp.ini и spxml2.ini
без запуска: первый SHA256
`2df12d723ede6505468290cc05db84e92e3eb11e1d6bb33defca5c067fd9bcd5`,
второй `9b1d37f80e45ee9f00b2dd4e455abd1f20e186f1461dcd1480d7a36551896c99`.
Последующий native routing опыт опроверг простой рецепт регистрации host через
DESIGN-DB/DATA-DB; историческое config чтение не является таким доказательством.

## Admin: что является наблюдением

Браузер 2026-11-10, Linux HCM 2025.2.1333/CLR 9.0.11/PostgreSQL legacy:
`/admin → /spxml_web/main.htm`, Персонал → Сотрудники, double-click существующей
собственной карточки, Общие сведения/Анкетные данные, E-mail/Внутренний e-mail.
Полнотекстовый поиск по фамилии был пуст; очистка с Enter показала запись.
Периодичность переиндексации объяснил пользователь; «20 минут» — пример,
расписание, ожидание индекса и обычный filter отдельно не проверены.
API create + browser read подтверждены; **UI-save не выполнялся**. Поля при
уточнении labels не редактировали, дублей не создавали. Тестовая запись оставлена
пользователю; PII/пароль/ID/адрес/скриншоты вне git. Тот факт не является
разрешением повторять внешний mutable сценарий при проверке Markdown.
