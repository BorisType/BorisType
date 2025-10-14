# BorisType

Проект поддержки компиляции TypeScript в валидный код на BorisScript.

Пример использования:
```ts
const groupId = OptInt(Param["group_id"]);

const groupDoc = tools.open_doc<GroupDocument>(groupId);
if (groupDoc === undefined) {
    Cancel();
}

const members = ArraySelectAll(groupDoc.TopElem.collaborators);
members
    .map((member) => tools.open_doc<CollaboratorDocument>(member.collaborator_id.Value))
    .filter(Boolean)
    .forEach((collaborator) => tools.create_notification("notification", collaborator.DocID, null, null, collaborator.TopElem));
```

НЕ ГОТОВО ДЛЯ ИСПОЛЬЗОВАНИЯ!!!