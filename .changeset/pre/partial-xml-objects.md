---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Add partial XML editing through `WshcmApi.objects.patch` and `wshcm_patch_object`. Edit selected fields on an existing object with a fresh full-read token, keyed array edits, explicit replacement and clear modes, and dry-run previews. Each handled attempt consumes its token. Equal candidates skip Save, and changed applies return the native readback. Errors retain the known ID and acknowledged Save status.
