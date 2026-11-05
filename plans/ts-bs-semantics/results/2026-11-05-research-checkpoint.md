# F-02a / E-01: точка остановки research/test этапа

Date: 2026-11-05. Status: **research checkpoint завершён; feature acceptance нет**.
Compiler baseline: `324c5886bc14cfd84f190c6e03df1c0dc21f0730` (merge #32).
Production `packages/bt-ir/src` и `packages/builtin-runtime/src` не изменены;
revision cases/runners/docs определяется diff и commits этого PR.

## Граница завершённого шага

Сохранены 23 named strict-valid TS cases / **48 mode comparisons**:
**10 PASS и 38 exact XFAIL**, isolated Node oracle, raw/final IR/output artifacts,
static cost manifests и процессный watchdog для зависшего интерпретатора.
XFAIL означает воспроизводимый известный дефект; новая ошибка, изменившийся
mismatch, XPASS, timeout или неполная выборка не делают baseline зелёным.
`pnpm test:expressions:baseline` — явное имя этой проверки; строгий
`pnpm test:expressions` по-прежнему требует JS equivalence и сейчас завершается
с failure. Никакие expression miscompilations не объявлены исправленными.

E-01 включает audit producers/consumers, сравнение A/B/C/inline вариантов,
6-context prototypes и output cost review. **24 sketches: 21 conforming,
3 intentional A counterexamples**. Это исследовательский код, не новый production
lowering. B + проверенный inline fast path остаётся предварительной рекомендацией;
E-02 остаётся draft. Полные F-01/F-02 inventory не закрыты.

Развитие **script/module остановлено до решения стратегии памяти** на C.
Реализации, defaults, регрессии и исследовательские изменения сохранены.
Поддерживаемое направление развития — bare, без обещания general closures,
modules/polyfills или отсутствия пользовательских циклов.
[ADR, источник memory report и условия возобновления](../../../ref/decisions/2026-11-05-script-module-memory-freeze.md).
Этот checkpoint не начинает следующий implementation slice и не выбирает
memory-management workaround.

## Execution identity

Node `v24.21.0`, TypeScript `6.0.3`, pnpm `12.5.1`. Entrypoint expression cases:
`compile`, strict TS, script/module + два bare controls. Локальный supplied JS
runtime, версия неизвестна, SHA-256:
`7ad30901c8b58de7255a38059e0793d2def16a9768e15ef603a8ea1a5e75e09c`.
Он отличается от runtime identity в [историческом отчёте](./2026-10-08-expression-baseline.md);
новые проверки не приписываются старому hash. Private source не публикуется.

Botest adapter; RegisterCodeLibrary polyfill/semantic/destructuring и
`bt.init_polyfill()`. Hashes runtime libraries совпали с октябрьским отчётом:

- polyfill: `24c004e58fde0d2c2e944aa599b14a6fc8f67ae02521c4d47311ad68e25ca840`;
- semantic: `a26cb38db8a2a7bab1a7aa2ff06ffcad2fec2a8efb51830af366eda525f57470`;
- destructuring: `dbef2681f58e595359225ad4aed63fb7fcc97f24a82a8639a07cb5f649673631`.

Source/oracle/output/catalog/baseline/harness hashes и результаты каждого case
записываются в ignored `packages/bt-ir/build/semantic/expressions/manifest.json`.
Raw/final IR и source/output доступны рядом. Replay sources входят в PR;
approved runtime нужно предоставить отдельно. Запуски runners, пишущих в один
artifact directory, следует выполнять последовательно.

## Повторные проверки

Команды выполняются из корня, после provisioning approved JS runtime.

| Проверка                                                                | Результат                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                        | Exit 0, lockfile согласован                                            |
| `pnpm check-versions`                                                   | Exit 0                                                                 |
| `pnpm audit --audit-level=high`                                         | Exit 0; 0 high/critical, остаётся 1 moderate                           |
| `pnpm exec turbo run build`                                             | Exit 0; 14/14 packages                                                 |
| `pnpm --filter @boristype/bt-ir --filter @boristype/eslint-plugin test` | Exit 0; 61 IR tests + 5 ESLint test files                              |
| `node packages/botest/build/index.js tests/build --node-check`          | BS 149/149, 17 suites; Node 138 PASS / 0 FAIL / 11 SKIP                |
| `pnpm test:semantic`                                                    | Exit 0; bare/script/module по 1920/1920, всего 5760 strict comparisons |
| `pnpm test:expressions:baseline`                                        | Exit 0; 48 comparisons: 10 PASS / 38 XFAIL                             |
| `node packages/bt-ir/test/semantic/run-expression-prototypes.mjs`       | Exit 0; 24 sketches, 3 ожидаемых A counterexamples                     |
| `pnpm lint`                                                             | Exit 0; 0 errors, 11 существующих warnings                             |
| `pnpm format:check`                                                     | Exit 0                                                                 |
| `pnpm docs:build`                                                       | Exit 0, включая проверку ссылок                                        |
| `git diff --check`                                                      | Exit 0                                                                 |

Отдельные диагностические запуски **не** являются зелёными acceptance gates:

- Strict `--case r01-and-skip --mode script`: exit 1, expected `0|false`, actual
  `1|false`. Проверено, что baseline не меняет строгий режим.
- Native survey: exit 1, **6 MATCH / 2 PARSER_REJECTION** (grouped member и
  dynamic case). Новая ошибка парсера не считается accepted XFAIL.

Runtime provisioning отсутствует в CI ([#29](https://github.com/BorisType/BorisType/issues/29));
execution results выше — локальные проверки, отдельно от GitHub CI.

## Два минимальных исправления проверок

1. Проверка сохранения текста `7603264645902515852` перенесена из общего
   safe-integer test в отдельный **platform-integer** case. Исходное BS assertion
   сохранено: exact integer text — существующий platform contract
   [ADR 2026-03-30](../../../ref/decisions/2026-03-30-numeric-literal-precision.md).
   Только новый platform-specific файл исключён из Node comparison, где Number
   округляет literal. Safe-integer cases остаются в differential check. Это
   разделение контрактов, а не исправление numeric lowering или доказательство C.
   Из 11 Node skips 10 существовали раньше, 1 — этот явно названный case.
   Известная проблема exit status Node advisory остаётся в
   [F-03/#30](https://github.com/BorisType/BorisType/issues/30); проверены и counts,
   а не только exit 0. Два существующих unregistered BS files также не исправлялись.
2. Для обязательного security audit обновлены только affected tooling:
   Vite `6.4.3 → 6.4.5`, launch-editor `2.14.1 → 2.14.2`, scoped overrides/lockfile
   для [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
   Сборка docs проверяет обновлённый Vite. Остаётся moderate advisory minimatch
   [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249);
   mandatory high gate проходит, отсутствие всех уязвимостей не заявляется.

## C / стоимость / незавершённое

Новых C executions, memory/teardown measurements и C feature acceptance нет.
Два bounded expression probes сохранены; их hashes и команды генерации — в
[историческом handoff](./2026-10-08-expression-baseline.md#c-handoff).
Ожидаемый `OK: 6/6` не является полученным C result. Ручной запуск этих probes
не требуется для публикации research checkpoint и не снимает memory blocker.

Стоимость оценена структурно: bytes, IR nodes, generated bindings, helper call
sites, array/object sites. Это не measured allocation count или benchmark C;
B/C byte-identical, inline меньше на шести выбранных contexts.
[Варианты, плюсы/минусы и ограничения](../research/01-expression-evaluation-results.md).

Script/module implementation leaves E-03a–E-07a и зависимые задачи остаются on hold.
Перед их возобновлением нужны memory strategy, принятый design/spec и отдельные
JS/C semantics/lifetime gates. Текущая точка остановки — воспроизводимое исследование
и сохранённая регрессия всех режимов, без дальнейшего расширения runtime ABI.
