> Исторический материал из `plans/mcp-server/10-object-model/implementation.md` (baseline `8ff2739`).
> Статусы, команды и утверждения ниже относятся к описанному этапу; актуальные входы — [refs](../../../README.md).

# XML object tools: первая реализация

**Goal:** получить раскрытую форму, прочитать полный XML объекта и создать/заменить один документ платформенным API.
**Architecture:** MCP передаёт XML строкой. Node проверяет синтаксис и строит только ограниченный список путей для проверки; сервер сверяет их с `XmlForm`. Данные сохраняются из исходного XML, без XML→JS→XML mapping.
**Tech stack:** Node 24, MCP SDK 2, Zod 4, строгий потоковый saxes 6, серверный BorisScript/XML API.
**Spec:** [xml-mvp.md](xml-mvp.md).

Результаты и точная граница завершения: [first-implementation.md](first-implementation.md).

## Контракт

- `wshcm_get_form({formUrl})` → `{formUrl,root,xml}`; XML раскрытого root, без обещания автономного импорта XMD.
- `wshcm_get_object({id})` → `{id,formUrl,root,xml,readToken}`. ID — canonical positive decimal string. Только полное чтение выдаёт token.
- `wshcm_save_object({mode:"create",formUrl,xml})` либо `{mode:"replace",id,readToken,xml}`. Дополнительные ключи запрещены.
- Create использует `OpenNewDoc` + `LoadData` исходного XML + `BindToDb` + `Save`. Для нового документа merge сохраняет defaults/OnCreate; это не merge с существующим объектом.
- Replace использует форму существующего документа, отдельный `OpenDocFromStr` + `BindToDb(existingId)` + `Save`. Пропущенные данные удаляются.
- Replace требует token, полученный полным чтением в том же экземпляре MCP. Token действует 30 минут, максимум 32 объекта; повторное чтение заменяет token. Попытка replace расходует token, в том числе при ошибке/timeout. Локальные операции сериализованы.
- Перед replace сравниваются текущие полный XML, URL формы и XML раскрытого root с прочитанными. Проверка повторяется непосредственно перед Save. Это не atomic CAS и не изоляция разных чатов на одном MCP instance.
- XML и раскрытая форма: максимум 256 KiB UTF-8 каждый; XML input: глубина 64, максимум 8192 элементов. Большой ответ отклоняется целиком, не обрезается и не выдаёт token.
- XML без DTD/entities definitions, произвольных PI и атрибутов данных. XML declaration допускается; root `SPXML-FORM` допустим только при совпадении с выбранной формой. Стандартные/numeric entities и CDATA поддерживаются. Необъявленные entities запрещены.
- До Save проверяются root, известность полей, singleton cardinality, отсутствие дочерних элементов у scalar и mixed content у structure, integer lexical/range. Integer допускает decimal/hex, signed int64 и unsigned XML representation до uint64 max. Остальные scalar types проходят native conversion, полной проверки типов/бизнес-правил нет.
- XML ID при create запрещён; при replace может отсутствовать либо совпадать с аргументом. Переключение формы/DB через payload/options запрещено. Form URL ограничен локальными `x-local://`/`x-app://` XMD без options delimiters.
- Ответ save содержит `{id,formUrl,root,xml,writeStatus:"saved"}` после readback. Ошибка содержит `phase`, `writeStatus:"not_attempted"|"unknown"|"saved"` и известный ID. После входа в Save ошибка не означает rollback. Retry автоматически не выполняется. `not_attempted` касается Save, не побочных действий загрузки/инициализации формы.
- Нет UI permission/business equivalence, bulk, удаления, typed JSON и patch DSL. Нет нового требования DLL.

## Задачи и проверки

### 1. Проверка входного XML

Files: `src/tools/object-xml.ts`, `test/object-xml.test.mjs`, dependency `saxes` в package.json/lockfile и узкий declaration-only pnpm patch.

- [x] Написать отрицательные тесты: неверные теги/два root, DTD/entity/PI, control chars, глубина/размер, неверные атрибуты, точный большой ID и конфликт формы. Пример: `assert.throws(() => inspectObjectXml('<a/><b/>'), /XML/)`.
- [x] Убедиться в RED, реализовать inspector, проверить GREEN. Inspector не сериализует XML заново; возвращает root/ID и список `{path,count,hasElements,hasText,text,integerValid}`.

### 2. Серверная операция и MCP protocol

Files: `resources/object-operation.bs`, `src/tools/objects.ts`, `src/tools/object-state.ts`, `src/tools/index.ts`, `src/server.ts`, `test/objects.test.mjs`, обновления inventory assertions.

- [x] Написать protocol/VM тесты трёх tools, token isolation/expiry/consumption, native negative-path validation, bounded response, ошибки Save/readback/transport и отсутствие retry.
- [x] Проверить RED; реализовать платформенную операцию и bounded envelope decode. Для integer `NaN` отрицательный сценарий должен завершиться до `Save`, счётчик save остаётся нулевым.
- [x] Проверить GREEN и весь MCP suite. JS doubles проверяют код/протокол, не доказывают C semantics.

### 3. Native acceptance

Files: `test/e2e/objects.mjs`, package script `test:e2e:objects`, собственные probes/evidence.

- [x] Запустить только существующий локальный Docker-стенд, проверить HTTP/auth/SOAP. Не менять vendor configuration/DLL.
- [x] Проверить CLI/stdio/SOAP: раскрытая форма, create/read/replace/clear omitted, Unicode/quotes/large ID, unknown field/bad integer/duplicate/root/ID, stale object, consumed token, no accidental create. Foreign-instance token проверяется локальным protocol suite.
- [x] Проверить естественный OnCreate+LoadData на собственной memory-only форме отдельно от DB acceptance. Не заявлять поддержку всех lifecycle/custom types из одного `cost_center`.
- [x] Удалять только выделенные ID через независимый evaluator; проверить каталог/trash/OpenDoc и отсутствие evaluator/fixture debris. Остановить WT и PostgreSQL, вернуть исходное состояние.

### 4. Документация и checkpoint

Files: package README, docs guide, ROADMAP, ADR и исследовательский отчёт.

- [x] Документировать XML examples, tokens, full replace и limits/errors; обновить inventory без обещания общей бизнес-валидации.
- [x] Проверить MCP build/test/pack, lint/format изменённых файлов, docs build и evidence verifiers.
- [x] Проверить итоговый diff и сохранить проверяемый checkpoint в текущей ветке draft PR #58.
