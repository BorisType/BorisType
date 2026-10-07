# L4. Leaf tasks

Backlog family IDs живут в [05-backlog.md](../05-backlog.md). После принятия spec
создавать leaf files, например `E-04a-logical-rhs.md`. Новая задача ссылается на
research/spec/test cases, а не дублирует общее описание всей программы.

## Шаблон карточки

```markdown
# <ID>: <один проверяемый результат>

Status: queued | researching | spec-ready | tests-ready | implementing | validating | done
Depends on: <IDs>
Research/spec: <links and rule IDs>
Findings/tests: <IDs>

## Scope

<Files/mechanism/consumer; что намеренно не входит в этот diff.>

## До изменения

<Reproduction, baseline commit, expected/actual, affected output shape.>

## Изменение

<Выбранный вариант; migrations; helper/ABI/deployment impact.>

## Acceptance

- [ ] Rule-focused permanent regressions
- [ ] Unchanged fast-path controls
- [ ] Output invariants/cost budget
- [ ] Relevant interactions + full pre-merge gates
- [ ] C evidence когда нужна; иначе status awaiting-c, не portable done
- [ ] Docs/result manifest

## Result / remaining work

<Commit and output hashes; links to reports; explicit open tasks.>
```

Стремиться к одной concept change на карточку. Если task требует одновременно
переписать analyzer, function ABI и module loader, сначала проверить, нельзя ли
разделить compatibility layer, primitive, consumer migrations и cleanup.

Не создавать десятки заранее «утверждённых» specs/patch descriptions по surface
review. Backlog допускает пересмотр design, leaf task появляется с evidence.
