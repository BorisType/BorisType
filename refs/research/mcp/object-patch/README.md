# Проверка XML patch на Linux C-runtime

В исходниках `observe.bs` и `file-observe.bs` сохранены первоначальные пробы от
2026-11-18. Запись `*-result.json` содержит SHA-256 фактически исполненного
текста после подстановки marker. Проверка исходных наблюдений не вызывает сервер.

```sh
node refs/research/mcp/object-patch/probe.mjs observe --verify
node refs/research/mcp/object-patch/probe.mjs file-observe --verify
node refs/research/mcp/object-patch/probe.mjs form-probe --verify
node refs/research/mcp/object-patch/probe.mjs date-probe --verify
```

Для свежего измерения убрать `--verify`. Собранный SDK, переменные
`WSHCM_USERNAME` и `WSHCM_PASSWORD` и локальный Docker со стендом нужны для
проверки инвентаря evaluator. Параметры `WSHCM_HOST`, `WSHCM_PORT`,
`WSHCM_CONTAINER` и `WSHCM_PATCH_RECEIPT` выбирают endpoint, контейнер и путь к
новому результату. Валидировать публичный SDK и shipped BS отдельно:

```sh
pnpm --filter @boristype/ws-client build
NODE_USE_ENV_PROXY=0 pnpm --filter @boristype/ws-client test:e2e:object-patch
```

Исторические пробы различают `BmObject` (Date и new Date), типизированный date
(OptDate и XmlElem.Value) и XmElem. В memory и при повторном открытии собственного
XML-файла IsChanged оставался false после ряда скалярных и структурных изменений.
SetChanged(true) менял flag при прежнем XML. Измерения не проверяли автоматический
flag всех видов документов БД.

`form-probe` проверяет PrimaryKeyName, независимое добавление в группы,
преобразование чисел и дат. Например, в этом runtime строка 1e309 становится
inf, а XML-загрузка может сохранить прежнее значение при ошибочном вводе.
Для integer patch читает точную десятичную строку в Int и проверяет
обратное native представление. У real сохраняется точность платформенного
числа и XML-сериализатора.

Проба `date-probe.bs` сравнивает BmObject от new Date, native date, XML clock,
TimeZone, GetLocalTimeZone и DateToRawSeconds до и после Save/reopen файла.
Для 2025-02-03 04:05:06 native XML печатает +00:00, GetLocalTimeZone возвращает 3,
а native epoch — 1738544706. Стандартный UTC epoch этого ISO-текста — 1738555506.
RawSecondsToDate последнего значения печатает 07:05:06+00:00. Метод getTime
у проверенного BmObject отсутствовал. Вложенная timezone могла исчезнуть при
открытии файла. Patch поэтому сохраняет wall time. Принимаются date-only,
dateTime без смещения, с Z или нулевым смещением. Ненулевое смещение,
ненулевая доля секунды и неверный календарь отклоняются. Повтор поля
doc_info/modification/date из настоящего get собственной записи не вызвал Save.
Дата Node-процесса и его timezone не участвуют в преобразовании wall clock.

Для 0001, 0099, 0999 и 0400-02-29 и StrXmlDate(value,true,true), и
XML после Save/reopen печатали год без ведущих нулей. Год 1000 сохранил
четыре цифры. Сравнение компонентов восстанавливает четырёхзначный год.
Повторный patch фактического XML каждого из пяти полей оставил прежний XML
и счётчик OnBeforeSave. Для короткого года допускается именно полное
native написание вида `1-01-02T12:34:56+00:00`.
[Данные форматирования и повторного открытия](./acceptance.json)

У временного файла и у сохранённых через БД полей cost_center.name/comment
сохранялись ведущие и внутренние пробелы. Чисто текстовая XML-загрузка удаляла
хвостовые пробелы. CDATA и числовые ссылки могли сохранить их при загрузке в память,
но прямое присваивание строки с пробелами и Save/reopen также удаляло их. Patch
нормализует отдельный source scalar через его собственные Xml и LoadData на actual
форме. Кандидатом остаётся открытый объект. Другие XMD и backends требуют своей проверки.

Явный clear сбрасывает поле. Если форма восстанавливает DEFAULT при открытии,
кандидат уже содержит это значение. Для integer DEFAULT=7 в отдельном файле
протестированы переходы 9 → clear → 7 и 8 → пустой элемент → 7 с повторным
применением. При replace структуры или keyed-элемента пропущенные поля получают
значения новой структуры этой формы. Изменение только состава массива также
участвует в сравнении persistent XML.

В acceptance receipt записаны версия, image, хеши файлов и каждого отправленного
BS, результаты повтора после открытия файла и показания OnBeforeSave. Ошибки
Save, потерянное подтверждение, гонка между первой и последней проверками и
невалидный readback проверены на исполняемом shipped resource в VM. Реальный
cost_center проходит создание, частичный Save, dryRun/no-op, stale input и
удаление с проверкой известного ID и уникального маркера. Базовый XML списка
пакетов и инвентарь evaluator проверяются при очистке. Динамические формы
живут в памяти процесса, их eviction до остановки стенда не проверен.
Результаты относятся к Linux C HCM 2025.2.1333 и этому набору форм.

Справка описывает загрузку полей из XML, рефлексию формы и добавление отсоединённого элемента. [XmlElem.LoadData](https://wshcm-docs.boristype.dev/datex/common/5620276892448878658.html#xmlelem-loaddata), [XmlFormElem](https://wshcm-docs.boristype.dev/datex/common/5791375928854454846.html#xmlformelem), [CreateElemByFormElem](https://wshcm-docs.boristype.dev/datex/common/7172076235998782759.html)

Сигнатуры wshcmx/types в ревизии a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b. [lib/xmlelem/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlelem/index.d.ts), [lib/xmlformelem/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/xmlformelem/index.d.ts), [lib/core/index.d.ts](https://github.com/wshcmx/types/blob/a3b1e43d0b2add53bbc1f2acc2c5128360e8c97b/lib/core/index.d.ts)
