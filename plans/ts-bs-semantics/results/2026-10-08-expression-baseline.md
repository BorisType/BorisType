# F-02 / E-01: baseline и design sketches

Исторический отчёт; повторные проверки и решение о приостановке script/module —
в [checkpoint 2026-11-05](./2026-11-05-research-checkpoint.md).

Date: 2026-10-08. Compiler baseline commit:
`324c5886bc14cfd84f190c6e03df1c0dc21f0730` (main после #32).
Production `packages/bt-ir/src` / `builtin-runtime/src` не изменялись;
рабочие изменения — research runners/tests/docs и npm scripts.
Node `v24.21.0`, TypeScript `6.0.3`, pnpm `12.5.1`.

## Execution identity

Supplied JS runtime version unknown; SHA-256:
`8f999ef036db5b9d4ce9ce98b0d81709f7db265197919c2a337560fad56b5090`.
Botest adapter; `RegisterCodeLibrary` polyfill/semantic/destructuring,
`bt.init_polyfill()`. Runtime source не скопирован/опубликован.

Build library identities:

- polyfill: `24c004e58fde0d2c2e944aa599b14a6fc8f67ae02521c4d47311ad68e25ca840`
- semantic: `a26cb38db8a2a7bab1a7aa2ff06ffcad2fec2a8efb51830af366eda525f57470`
- destructuring: `dbef2681f58e595359225ad4aed63fb7fcc97f24a82a8639a07cb5f649673631`

Source entrypoint: `compile`, `strict: true`, isolated Node source VM oracle.
Script executes emitted BS; module uses actual codelibrary and `__init`.
Observable этого начального каталога — string result с trace/counters/state;
тип промежуточного operand и exact thrown identity отдельно не аттестованы.
Bare controls передают ledger явно, не используют unsupported lexical captures.
`compileSourceFile`/btc-specific regression families **не добавлены** этим срезом.

Catalog SHA-256:
`c015f7a78e33fe1dbe6d1a6d36b3a52e61d0855588f9317790f6c8f15109ca25`.
Exact baseline manifest SHA-256:
`304c76604e4a7d523e8f1ce30177b10489cec34da8f3e6a5cf6ee14c5aaa4d3c`.
Per-source/oracle/raw+final IR/output, runner hashes, counts, diagnostics и static
cost сохранены в ignored `packages/bt-ir/build/semantic/expressions/manifest.json`
и соседних named artifacts. Replay sources доступны в git без private runtime.

## Команды и результаты

Из корня, после provision approved JS runtime:

| Command                                                                                   | Result                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run build`                                                               | Exit 0; 14 packages; существующий warning output discovery example                              |
| `pnpm --filter @boristype/bt-ir test`                                                     | Exit 0; 61/61 unit/output/research utility tests                                                |
| `node packages/botest/build/index.js tests/build`                                         | Exit 0; BS E2E 148/148, 17 suites                                                               |
| `node packages/botest/build/index.js tests/build --node-check`                            | BS 148/148; advisory Node **137 pass / 1 fail / 10 skipped**, exit 0 не означает oracle success |
| `pnpm test:semantic`                                                                      | Exit 0; 1920 × 3 = 5760 strict abrupt/update comparisons                                        |
| `pnpm test:expressions --baseline`                                                        | Exit 0; **48 comparisons: 10 PASS, 38 XFAIL**, zero errors/XPASS                                |
| `node packages/bt-ir/test/semantic/run-expressions.mjs --case r01-and-skip --mode script` | Expected exit 1; `0\|false` vs `1\|false`, не false-green strict gate                           |
| `node packages/bt-ir/test/semantic/run-expression-native.mjs`                             | Expected exit 1; **6 MATCH / 2 PARSER_REJECTION**, не acceptance gate                           |
| `node packages/bt-ir/test/semantic/run-expression-prototypes.mjs`                         | Exit 0; 24 sketches, **21 conforming / 3 intentional A counterexamples**; оба C packs JS pass   |

Unknown/incomplete/zero selection, exact XFAIL/XPASS, worker-load failure и
synchronous-hang watchdog проверяются unit tests. Missing runtime/library —
preflight error до сравнения; не accepted XFAIL. Процесс, а не Promise timer,
прерывает synchronous target hang.

Дополнительно: eslint-plugin 5/5 test files; `pnpm lint` exit 0 (0 errors,
11 existing warnings); `pnpm format:check` и `git diff --check` exit 0.

Node numeric advisory failure неизменён: large integer text
`7603264645902515852` vs Node Number `7603264645902516000`.
Botest также сообщает два unregistered files, как на baseline. Никакие эти
проблемы не замаскированы new blanket skip; F-03/L-03 остаются открыты.

## C handoff

**C ещё не запускался**, пользователь выполнит probes после остановки агента.
Version/config unknown. Каждый файл выполняется отдельно, libraries bt не нужны:

| Artifact под `packages/bt-ir/build/semantic/expressions/prototypes/` | MESSAGE   | SHA-256                                                            |
| -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `BtExpressionShapeProbe.js` — B statements/scalars                   | `OK: 6/6` | `1500d3400d93e8a6ccf5239c48a5e611d2df93e939c668bc2b16b07b0c681885` |
| `BtExpressionInlineProbe.js` — I inline/grouping                     | `OK: 6/6` | `2527a770fc67214f4267fa106cc05bf5e31a5d7078589ed7454360cf8f9d21be` |

Оба bounded research packs содержат fuel guard в while (max 5 body entries).
Это own IR-generated sketches, **не** compiled production TS output; поэтому
corresponding fixed production hash ещё нет. Probe не покрывает do/for/labels/
finalizers/parameter phase и script/module descriptor ABI на C. Не заменяет
последующую acceptance после compiler fix. Отдельные native cases лежат в
`expressions/native/`; parser-rejected forms не объединены с successful pack.

## Output / performance review

AST-based output parsing и no-comma-for-update assertion для baseline output;
bytes/final IR nodes/generated bindings/call sites/array/object sites записаны
per case. Static sites включают emitted scaffold; это не measured allocations.
B/C sketches byte-identical; I меньше по code/scalars на шести выбранных cases.
Exact counts, caveats, trade-offs:
[research](../research/01-expression-evaluation-results.md).

C timing, heap allocations, copies, N-size benchmark **not measured**.
Raw parser survey: grouped ternary в 6 contexts — MATCH; grouped member и
dynamic case — PARSER_REJECTION на указанном JS runtime, C unknown.

## Вывод / открытое

F-02a завершён, E-01 имеет JS evidence и recommendation **B + inline fast path**.
[Spec](../specs/01-expression-evaluation.md) остаётся draft; accepted ADR ещё нет.
F-01 full inventory и F-04 native/C matrix не завершены. Никакая feature не
помечена fixed: production compiler пока воспроизводит 38 known failures.
Дальнейшие leaf tasks:
[F-02a handoff](../tasks/F-02-expression-baseline.md).
