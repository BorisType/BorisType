# Создание и проверка ручного серверного агента

Сценарий проверен через собранный BorisType MCP с `wshcm_run_agent` на
standalone Linux HCM 2025.2.1333, C-runtime, PostgreSQL. Схемы аргументов
сверяй с подключённым MCP. Для пробы используй свой уникальный код
и отдельный серверный путь. Если каталога ещё нет, создай его через
`wshcm_create_directory`.

1. Запиши тестовый JS через `wshcm_write_file` в режиме `create` и
   перечитай его через `wshcm_read_file`. Прочитай форму
   `x-local://wtv/wtv_server_agent.xmd` через `wshcm_get_form`. Проверь
   уникальность кода запросом к `server_agents` через `wshcm_xquery`.
2. Передай XML и URL формы в `wshcm_save_object` с `mode: "create"`.
   Для ручного запуска используй `trigger_type=never`, `type=code`,
   `exec_code.code_type=js`. Для внешнего кода заполни оба URL.
3. Перечитай полученный точный ID через `wshcm_get_object`. Сверь триггер,
   оба URL и объявленные `wvars`. Для последующей правки используй свежий
   `readToken` из этого чтения. Перечитай объект после попытки правки.
4. Запусти `wshcm_run_agent({"agentId":"<точный ID>","mode":"sync","waitTimeoutMs":5000})`.
   Для проверки сохранённых `wvars` оставь `params` отсутствующим.
   `ended` сообщает, что поток закончился. Сверь свежую запись лога или
   артефакт запуска с ожидаемым результатом и значением параметра.

```xml
<server_agent>
  <code>skills_demo_manual</code>
  <name>Skills demo</name>
  <trigger_type>never</trigger_type>
  <type>code</type>
  <exec_code>
    <code_type>js</code_type>
    <code_url>x-local://wt/skills-demo/agent.js</code_url>
  </exec_code>
  <run_code_url>x-local://wt/skills-demo/agent.js</run_code_url>
  <wvars>
    <wvar>
      <name>demo_value</name>
      <value>persisted</value>
    </wvar>
  </wvars>
</server_agent>
```

Тело тестового файла. Для каждого прогона выбери новый путь маркера
или проверь, что файл относится к этому прогону.

```js
PutUrlText("x-local://wt/skills-demo/complete.txt", Param.GetOptProperty("demo_value", "missing"));
```

После запуска сохранённого агента маркер содержал `persisted`. В исходной
пробе один `run_code_url` пропал после записи. В новой пробе оба поля
с одним URL сохранились. [Исходная проверка](https://github.com/BorisType/BorisType/issues/81)

## Штатный запуск из серверного BorisScript

На проверенном standalone WT оба маршрута вызвали существующего агента
с его сохранённым параметром. `tools.start_agent` подходит для запуска по ID:

```js
tools.start_agent(Int(agentId), undefined, "", Date());
```

Для прямого вызова метода формы:

```js
var agent = OpenDoc(UrlFromDocID(Int(agentId)));
if (agent.TopElem.Name != "server_agent" || agent.TopElem.code.Value != "skills_demo_manual") {
  throw "Тестовый агент не найден";
}
agent.TopElem.run_agent(undefined, "", Date(), false, "Release");
```

При создании без MCP нативный путь тот же, что в реализации сохранения.
Открой форму через `OpenNewDoc(formUrl)`, загрузи XML в
`doc.TopElem.LoadData(xml)`, вызови `doc.BindToDb(DefaultDb)` и
`doc.Save()`. Затем открой `OpenDoc(UrlFromDocID(doc.DocID))` и проверь
сохранённые поля. Перед созданием проверь уникальность кода и входной XML.

Пятый аргумент `run_agent` подтверждён в поставляемой `wtv_server_agent.xmd`.
В web-role поставляемый `tools.start_agent` отправляет команду в очередь.
Подтверждай фактическое выполнение по эффекту агента в своей конфигурации.
[Datex start_agent](https://wshcm-docs.boristype.dev/news/monolith/6680802585513428903.html#start-agent)

## Ошибка после изменения

При `wait_timeout` агент может продолжать работу. При потере ответа сначала
проверь эффект запуска. В проверке `wshcm_execute` уже записал файл, когда
вернул ошибку с `error.phase: "result"` при проекции глубокого объекта.
Если файл уже есть и соответствует ожидаемому результату, прочитай его
и верни небольшой JSON с нужными полями. `transport` и `response` могут
означать неизвестный исход. Перед повторной мутацией проверь состояние
объекта или артефакта.
[Контракты MCP](https://github.com/BorisType/BorisType/blob/main/packages/mcp-server/README.md#запуск-серверного-агента)
