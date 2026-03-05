# Архитектура Dev Mode

## Концепция

Dev mode запускает цикл разработки:
```
watch → build → link → push (stub)
```

## Точки интереса (Watch Targets)

### Определение пакетов для watch

**Не можем** повесить глобальный watch на все пакеты — у них разные конфигурации.

**Решение**: читаем Link Context и определяем пакеты для отслеживания:

```typescript
// Пакеты которые отслеживаем
const watchablePackages = linkContext.packages.filter(pkg => 
  pkg.type !== 'library'  // library пакеты игнорируем
);
```

| Package Type | Watch | Причина |
|--------------|-------|---------|
| `standalone` | ✅ | Основной пакет |
| `component`  | ✅ | Часть проекта |
| `system`     | ✅ | Системный пакет |
| `library`    | ❌ | Внешняя зависимость, не меняется |

### Что отслеживаем в каждом пакете

```
package/
├── src/           ← watch *.ts, *.json, etc.
├── btconfig.json  ← watch (перечитать конфиг)
├── tsconfig.json  ← watch (перезапуск TS watcher)
└── package.json   ← watch (изменение ws:name, ws:type)
```

## Архитектура

### Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    DevPipeline                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Читаем LinkContext (какие пакеты линкуем)          │
│  2. Для каждого не-library пакета:                     │
│     - Создаём PackageWatcher                           │
│     - Подписываемся на события                         │
│  3. При изменении:                                     │
│     - build изменённого пакета                         │
│     - link (обновление dist)                           │
│     - push (stub)                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Компоненты

```
btc/src/core/dev/
├── index.ts           # DevPipeline
├── types.ts           # DevContext, DevState, WatchEvent
├── watcher.ts         # PackageWatcher (per-package)
├── orchestrator.ts    # Координация build→link→push
└── ui.ts              # Терминальный UI
```

## Watch стратегия

### Per-Package Watcher

Каждый пакет получает свой watcher с учётом его конфигурации:

```typescript
interface PackageWatcher {
  packageInfo: PackageInfo;
  
  // Пути для отслеживания (из tsconfig.include)
  watchPaths: string[];
  
  // Игнорируемые пути (node_modules, build, dist)
  ignorePaths: string[];
  
  // События
  on(event: 'change', handler: (files: string[]) => void): void;
  on(event: 'config-change', handler: () => void): void;
  
  close(): void;
}
```

### Debouncing

```typescript
// При быстрых изменениях (Ctrl+S несколько файлов)
const DEBOUNCE_MS = 150;

// Батчим изменения за 150ms, потом один build
```

## События и реакции

| Событие | Файлы | Действие |
|---------|-------|----------|
| `source-change` | `src/**/*.ts` | build → link |
| `asset-change` | `src/**/*.{json,xml}` | copy → link |
| `tsconfig-change` | `tsconfig.json` | restart TS watcher |
| `btconfig-change` | `btconfig.json` | reload config, relink |
| `package-change` | `package.json` | full rebuild |

## UI (Terminal)

```
┌────────────────────────────────────────────────┐
│  BTC v0.0.1-alpha.9  dev mode                  │
│                                                │
│  Watching 3 packages:                          │
│    • my-app (standalone)                       │
│    • shared (component)                        │
│    • backend (system)                          │
│                                                │
│  Status: ● watching                            │
│                                                │
│  Last build: 15:30:45 (1.2s)                  │
│  Errors: 0 | Warnings: 2                       │
│                                                │
│  [r] rebuild  [q] quit                         │
└────────────────────────────────────────────────┘
```

## Интеграция с Linking

### Текущий подход

Link command создаёт `LinkingRegistry` с информацией о пакетах.

### Для Dev Mode нужно

1. **Получить список пакетов** из LinkingRegistry
2. **Определить watch paths** для каждого пакета (из его tsconfig)
3. **Хранить связь** package → watcher → build context

### Возможные изменения в Linking

```typescript
// LinkingRegistry должен предоставлять
interface LinkingRegistry {
  // Существующее
  getPackages(): PackageInfo[];
  
  // Новое для dev mode
  getWatchablePackages(): PackageInfo[];  // без library
  getPackageBuildContext(pkg: PackageInfo): BuildContext;
}
```

## MVP Scope

### Включено в MVP
- [x] Чтение LinkContext для определения пакетов
- [x] Watch на не-library пакеты
- [x] Build при изменении source
- [x] Link после успешного build
- [x] Простой терминальный UI
- [x] Keyboard shortcuts (r, q)

### Отложено
- [ ] Push (заглушка)
- [ ] Инкрементальный link (только изменённые)
- [ ] HMR (hot module replacement)
- [ ] Параллельный build нескольких пакетов

## Зависимости

```json
{
  "dependencies": {
    "chokidar": "^3.5.3"  // file watching
  }
}
```

## Open Questions

1. **Порядок build**: Если изменился shared и app одновременно — в каком порядке билдить?
2. **Ошибка в одном пакете**: Продолжать билдить остальные?
3. **Cache invalidation**: Когда сбрасывать linking cache?
