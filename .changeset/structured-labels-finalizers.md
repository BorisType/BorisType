---
"@boristype/bt-ir": minor
"@boristype/eslint-plugin": patch
---

Support synchronous labelled break/continue and replace try/finally throw
sentinels with structured abrupt completions. Preserve lexical catch bindings,
captured per-entry values, source target identity and finalizer overrides.
Reject unsupported catch patterns and Annex B labelled functions explicitly.
Normalize comma-operator for updates before completion lowering to avoid the
reported C-runtime hang, preserving continue/finalizer/update ordering without
helper calls. Reject unsafe surviving update headers in the emitter.
Remove the deprecated legacy try/finally jump rule from the recommended preset.

Custom IR pass consumers must now supply the shared collision-safe
`PassContext.bindings` from scope analysis/lowering. Run `forUpdateDesugarPass`
before `abruptCompletionDesugarPass` (including its deprecated
`tryFinallyDesugarPass` alias); `runPasses` now enforces this dependency.
Invalid control targets report individual positional BT90018 diagnostics rather
than a generic pass failure. The pass manager stops after newly reported errors.
Fix recursive collector traversal through labelled bodies and the indentation
of standalone emitted blocks. The comma predicate now lives in shared IR
utilities; its previous pass-module export remains as a deprecated re-export.
