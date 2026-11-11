# ADR 006: Единое разрешение env chain и per-call environment

Дата решения: 2026-02-26; уточнение registration env — 2026-03-01.
Статус: историческое основание script/module ABI. Развитие
[заморожено](2026-11-05-script-module-memory-freeze.md) до решения стратегии памяти.

## Три связанные ошибки

На модуле `routes.ts` с Trie-маршрутизатором обнаружили:

1. Captured state жил в env, созданном один раз при регистрации функции. Повторный
   вызов перезаписывал состояние предыдущего (`createTrieNode_env.node = {}`).
2. Отдельный `getCodelibraryDepth` считал только captured block scopes; после
   добавления function env путь к `__codelibrary` получался слишком коротким.
3. Identifier callee строился напрямую от current env, обходя captured/depth
   resolution. Вложенный вызов искал функцию в текущем env вместо родительского.

Повторение chain construction в captured vars/params, imports, helpers и function
registration делало исправление глубины локальным и оставляло похожие дефекты.

## Выбранный подход

Для нуждающейся в captured state функции env создаётся внутри каждого вызова:

```javascript
function createTrieNode(__env, __this, __args) {
  var __fn0_env = { __parent: __env };
  __fn0_env.node = {};
}
```

Descriptor использует текущий lexical env. Отдельный registration env впоследствии
удалён, чтобы не добавлять лишний уровень chain. Исторически удалены также
`bindings.envName`, `IRFunctionDescriptor`, `IREnvRegisterFunction`; это хронология,
не список необходимых действий для текущего checkout.

[env-resolution.ts](../../packages/bt-ir/src/lowering/env-resolution.ts)
собирает `buildEnvChainBase`, `buildEnvChainAccess`, `resolveEnvAccess`,
`resolveModuleLevelAccess` и `getModuleEnvDepth`. Общий `getEnvDepth` учитывает
нужные captured scopes. Captured identifier calls должны пользоваться той же
политикой, что и captured reads, а не хардкодить current env.

## Альтернативы и стоимость

Сохранить второй алгоритм depth и лишь добавить function scopes было проще локально,
но сохраняло расхождение двух правил. Дополнительный analyzer pass только для callee
не был нужен: необходимая captured metadata уже существовала. Создавать per-call
env для всех функций означало allocation даже без captured state; исторически
выбрана зависимость от `hasCaptured`.

Per-call allocation изолирует состояния повторных вызовов, но не доказывает общую
корректность рекурсии, lifetime и ownership. Env ↔ descriptor может образовать
цикл; reference-counted C runtime не собирает его автоматически. Старые утверждения
«env всегда правильный», «все function patterns» и «overhead минимален» не заменяют
проверок. Исторические regressions: `per-call-env`, `codelibrary-module`,
`module-func-calls`; маршруты текущих проверок — [verification](../compiler/verification.md).
Текущее объяснение ABI и ограничений — [compiler](../compiler/README.md).
