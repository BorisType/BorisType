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
