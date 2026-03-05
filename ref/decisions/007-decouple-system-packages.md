# 007. Отвязка system-пакетов от зависимостей компилятора

**Date:** 2026-02-23  
**Status:** ✅ Implemented (2026-02-26)  
**Implementation:** v0.1.0-alpha.4

---

## Проблема (было)

До v0.1.0-alpha.4 `@boristype/runtime` и другие system-пакеты линковались как **зависимости компилятора**: система искала их в `dependencies` пакета `@boristype/bt-cli`.

Это создавало **циклическую зависимость** в monorepo:

```
bt-cli ──(dependencies)──→ @boristype/runtime
@boristype/runtime ──(devDependencies)──→ @boristype/bt-cli (для сборки)
```

### Последствия

1. **Turborepo `dependsOn: ["^build"]`** не мог определить порядок сборки при циклических зависимостях
2. **Bootstrap проблема**: чтобы собрать runtime нужен bt-cli, но bt-cli зависит от runtime
3. bt-cli тянул runtime как прямую зависимость — пользователь получал runtime автоматически, но это делало bt-cli тяжелее

---

## Решение (реализовано)

### Изменения в bt-cli

`@boristype/runtime` перенесён из `dependencies` bt-cli. Теперь пользователь **явно добавляет** system-пакеты в свой проект:

```json
// package.json проекта пользователя
{
  "dependencies": {
    "@boristype/runtime": "^0.1.0"
  },
  "devDependencies": {
    "@boristype/bt-cli": "^0.1.0"
  }
}
```

### Новый механизм линковки

Реализован в `packages/bt-cli/src/core/linking/dependencies.ts`:

```typescript
export async function getSystemDependencies(projectPath: string): Promise<DependencyNode[]> {
  // 1. Читаем package.json проекта (не bt-cli!)
  const rootPackageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf-8'));

  // 2. Собираем все зависимости проекта
  const allDeps: Record<string, string> = {
    ...(rootPackageJson.dependencies || {}),
    ...(rootPackageJson.devDependencies || {}),
  };

  // 3. Используем createRequire с контекстом проекта
  const projectRequire = createRequire(path.join(projectPath, 'package.json'));

  // 4. Ищем пакеты с ws:package === "system"
  for (const [depName] of Object.entries(allDeps)) {
    const depPackageJsonPath = projectRequire.resolve(`${depName}/package.json`);
    const depPackageJson = JSON.parse(await fs.readFile(depPackageJsonPath, 'utf-8'));
    
    if (depPackageJson['ws:package'] === 'system') {
      result.push(new DependencyNode(depPackageJson, depProjectPath));
    }
  }
}
```

**Ключевое отличие:** система ищет system-пакеты **в зависимостях проекта**, а не в зависимостях bt-cli.

### Дополнительные фичи

**Флаг `--external-runtime`:**

```bash
btc link --external-runtime
```

Пропускает линковку system-пакетов. Используется когда runtime управляется извне (например, глобально на платформе).

**Автоматическое предупреждение:**

Если system-пакеты не найдены, линковщик выдаёт warning:

```
⚠️  System-пакеты (например @boristype/runtime) не найдены в зависимостях проекта.
   Добавьте @boristype/runtime в dependencies/devDependencies проекта,
   или используйте --external-runtime если runtime управляется извне.
```

---

## Результаты

### ✅ Проблемы решены

1. **Циклическая зависимость устранена** — bt-cli больше не зависит от runtime
2. **Turborepo работает корректно** — порядок сборки определяется автоматически
3. **bt-cli стал легче** — runtime не включается в публикацию
4. **Гибкость** — пользователь контролирует версии system-пакетов

### 📊 Обновлённая структура зависимостей

```
bt-cli (build first)
  └── dependencies: bt-ir, ws-client, archiver, ...

runtime (build after bt-cli)
  └── devDependencies: @boristype/bt-cli (только для сборки)

user-project (build last)
  ├── dependencies: @boristype/runtime
  └── devDependencies: @boristype/bt-cli
```

### 📝 Примеры использования

**Новый проект:**

```json
{
  "name": "my-app",
  "dependencies": {
    "@boristype/runtime": "^0.1.0"
  },
  "devDependencies": {
    "@boristype/bt-cli": "^0.1.0"
  }
}
```

**С внешним runtime:**

```bash
# Runtime установлен глобально на платформе
btc link --external-runtime
```

### 🔄 Обратная совместимость

Система поддерживает оба сценария:
- **Новый:** runtime в зависимостях проекта (рекомендуется)
- **Legacy:** можно пропустить runtime через `--external-runtime`

---

## Связанные документы

- [System Package Type](../../docs/reference/package-types.md#system) — документация по типу system
- [Linking Architecture](../architecture/linking-system.md) — архитектура системы линковки
- [dependencies.ts](../../packages/bt-cli/src/core/linking/dependencies.ts) — реализация getSystemDependencies()

---

## Метрики реализации

| Метрика | До | После |
|---------|-----|-------|
| Циклические зависимости | 1 (bt-cli ↔ runtime) | 0 |
| Размер bt-cli (node_modules) | ~X MB | ~Y MB (↓) |
| Время bootstrap monorepo | Manual order | Auto (Turborepo) |
| Гибкость версий runtime | Фиксированная (через bt-cli) | Любая (в проекте) |

---

**Статус:** ✅ Полностью реализовано и работает в production (v0.1.0-alpha.4+)
