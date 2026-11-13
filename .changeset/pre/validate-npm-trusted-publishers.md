---
"@boristype/bt-cli": patch
"@boristype/runtime": patch
"@boristype/eslint-plugin": patch
"@boristype/bt-ir": patch
"@boristype/ws-client": patch
"@boristype/ws-version": patch
"@boristype/mcp-server": patch
---

Publish the coordinated alpha package set through per-package GitHub Actions
trusted publishers, retaining independent versions and the existing CLI/runtime/
ESLint fixed group. Include the accumulated compiler, CLI and transport changes
prepared in the preceding release checkpoint. Exclude compiled ESLint tests from
the npm archive and include the runtime README with its deployment and memory
limitations. Runtime behavior is unchanged by this release preparation.
