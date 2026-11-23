---
"@boristype/ws-client": minor
"@boristype/mcp-server": minor
---

Discover registered custom-field templates with `wshcm_get_custom_field_definitions({mode: "list", objectType})` or `api.customFields.list({objectType})`. The paginated result includes the owner type, selector, and summaries for empty and page-only templates. Read a specific `scope` for full definitions and a revision.

The object type registry removes the `includeCustomFields` input and the `customFields` result. Use the new discovery mode for template metadata.
