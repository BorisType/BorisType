# L5. Результаты и evidence

Пока здесь нет новых implementation acceptance reports. Historical baseline —
в [00-context.md](../00-context.md), observations — в [02-findings.md](../02-findings.md).

## Manifest результата

```text
task/spec/rule IDs:
date / commit SHA / worktree diff identity:
Node / TypeScript / compiler/runtime library versions:
mode / entrypoint / compile options:
JS runtime version (or unknown) / SHA-256 / adapter/setup:
C runtime version (or unknown) / platform/config / execution setup:
case catalog revision / selection / expected and executed counts:
commands / exit status / passed / failed / skipped and reasons:
source / oracle / generated output hashes:
instrumented C probe hash + corresponding production output hash:
actual results / traces / MESSAGE:
output invariants + structural counts:
timings: measured environment, N, warmup, repeats, median/spread:
not measured / unknown / remaining findings:
docs/ADR/task links:
```

Один manifest может ссылаться на ignored build artifacts, но replay command и
case sources должны быть доступны без восстановленного приватного runtime из git.
В отчёт не включать supplied runtime source, secrets, host data или proprietary artifacts.

## Что можно утверждать

- `unit-verified`: механизм/IR assertions проверены, execution не заявлен.
- `JS-verified`: конкретный supplied runtime/mode/case set; C unknown.
- `C-smoke-verified`: конкретный bounded pack, не полная feature matrix.
- `accepted subset`: spec rules, relevant interactions, output/cost и требуемые
  JS/C gates выполнены; оставшиеся ограничения явно описаны.

После изменения output/runtime ABI предыдущий report сохраняется как исторический,
но не служит acceptance нового commit. Byte-identical reuse C result требует
сравнения hashes и ссылки на исходную проверку; это не новый C run.

Fixture xfail/skip, unavailable runtime, empty selection и advisory Node result
не должны сливаться с числом successful strict comparisons.
