# L0. Baseline и основания

## Состояние на момент аудита

- Дата: 2026-10-07.
- HEAD: `57eaa89050f850eb426e971e5c8d338c87037cb6` — документация runtime contract.
- Compiler baseline: merge PR #27, `fa493a2f69aaf2c48d284ff4224ace8983bbbbb`.
- Ветка при создании плана: `docs/runtime-compatibility-contract`.
- Node: `24.21.0`; pnpm: `12.5.1`; bt-ir использует TypeScript `6.0.3`.
- Workspace: `/c/Users/vomoh/Desktop/projects/BorisType`.

Перед следующей работой заново записать HEAD, diff, версии и hashes. Эти значения
не являются обещанием состояния будущего main. Первоначальная версия плана
подготовлена локально на указанном HEAD без изменений compiler/runtime.
Публикация плана — отдельный docs PR от актуального main после merge #31;
документация предыдущего PR повторно в diff не включается.

## Runtime evidence

Supplied JS runtime: `/home/agent/workspace/main.js`. Локальный ignored symlink:
`packages/botest/build/borisscript/main.js`. SHA-256:

```text
8f999ef036db5b9d4ce9ce98b0d81709f7db265197919c2a337560fad56b5090
```

Версия JS runtime неизвестна. Botest adapter предоставляет часть host/file API;
это не полная платформа. Новые probes использовали runtime libraries через
`RegisterCodeLibrary` и `bt.init_polyfill()`; destructuring library подключалась
для соответствующих probes.

C runtime — независимая реализация. Доступа к source и версии нет. Пользователь
ранее подтвердил:

- carrier probes: `AB`, `012`;
- `Check27Fixed.js`: `0FU1FU2FU|E`;
- `BtAbruptProbe.js`: `OK: 60/60`.

Это выбранные bare-mode control-flow cases, **не** общая проверка functions,
closures, modules, classes, polyfills или новой expression semantics на C.
Новые surface probes на C не выполнялись.

Оригинальный C comma-update case зависал. Пропуск `i++` — пользовательская
гипотеза, не доказанное устройство C parser. Обход через IR подтверждён;
получение C source не является обязательным условием всех дальнейших работ.

## Проверки поверхностного аудита

Следующие проверки выполнены **в предыдущем рабочем этапе**, не повторялись
при написании самого плана:

| Проверка                                         | Результат                             | Что не доказывает                               |
| ------------------------------------------------ | ------------------------------------- | ----------------------------------------------- |
| bt-ir build и selective turbo build tests/botest | Pass                                  | Runtime semantics                               |
| bt-ir unit/output tests                          | 55/55                                 | Покрытие остальных feature families             |
| Botest E2E                                       | 148/148, 17 suites                    | Новые interactions, полноту suites, C execution |
| Advisory Node validation                         | 137 pass, 1 fail, 10 skipped          | Общую JS equivalence                            |
| Дополнительные in-memory probes                  | Выборочные pass/failure, см. findings | Полную трёхрежимную матрицу                     |

Node failure: `tests/src/numericLiterals/edge-cases.test.ts` ожидает строку
`7603264645902515852`, Node Number даёт `7603264645902516000`. Этот case требует
явного решения о числовом контракте; его нельзя выдавать за универсальный
ECMAScript oracle или автоматически игнорировать.

Исторический strict control-flow gate после #27: 1920 cases × 3 modes = 5760
comparisons; selected C smoke 60/60. В surface-аудите полный strict gate заново
не запускался. `test:semantic` пока проверяет abrupt/update, не весь язык.

Baseline probes были in-memory scripts; постоянные регрессионные тесты для
новых findings пока не добавлены. `02-findings.md` хранит seed sources/results,
а `F-02` должен сделать их воспроизводимыми с сохранением manifest/output.

## Источники

- [Публичные ограничения](../../docs/reference/borisscript-constraints.md),
  [compile modes](../../docs/reference/compile-modes.md).
- [IR pipeline](../../ref/architecture/ir-pipeline.md),
  [реестр transformations](../../ref/architecture/ir-transformations.md).
- [Expression extraction ADR](../../ref/decisions/2026-03-03-expression-extraction.md),
  [logical operators ADR](../../ref/decisions/2026-03-09-logical-operators-lowering.md).
- [Env resolution ADR](../../ref/decisions/2026-02-26-unified-env-resolution.md),
  [numeric precision ADR](../../ref/decisions/2026-03-30-numeric-literal-precision.md).
- [Structured completion ADR](../../ref/decisions/2026-10-07-structured-abrupt-completion.md),
  [C-safe updates ADR](../../ref/decisions/2026-10-07-safe-for-updates.md),
  [pre-merge/C protocol](../probes/README.md).

В `ref/architecture/ir-transformations.md` секции TODO всё ещё называют
destructuring/spread/classes не реализованными, хотя partial lowering существует.
Некоторые старые ADR утверждают полную совместимость или отсутствие precedence
без достаточного основания. Не использовать эти утверждения как spec; обновить
после соответствующего исследования, сохраняя историю решений.

## Уже заведённые issues

- [#28](https://github.com/BorisType/BorisType/issues/28): multiple classic-for init declarations.
- [#29](https://github.com/BorisType/BorisType/issues/29): approved runtime execution/provisioning in CI.
- [#30](https://github.com/BorisType/BorisType/issues/30): unknown botest filter даёт zero-tests success.

План не создаёт новые issues. При реализации ссылаться на существующие; остаточные
проблемы оформлять отдельно по согласованному scope, не дублируя уже известные.
