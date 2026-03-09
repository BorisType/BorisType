# Команда artifact

## Назначение

**Команда `artifact`** создает ZIP-архивы из директории `dist/` для поставки и развертывания на целевой платформе.

Это финальный этап в пайплайне сборки:

```
build → link → artifact → deploy
```

## Использование

```bash
btc artifact
```

Команда запускается из корня проекта, где находится директория `dist/`.

::: warning Внимание
Поведение команды еще не определено окончательно и может измениться в будущих версиях. Текущая реализация может отличается от описанного.
:::

## Логика работы

### 1. Поиск директории dist

- Ищет `dist/` в текущем рабочем каталоге (cwd)
- Если не найдена — выдает ошибку и прерывает выполнение

### 2. Создание директории artifact

- Создает директорию `artifact/` в текущем рабочем каталоге
- Если уже существует — использует её

### 3. Архивирование основного содержимого

Создает **`main.zip`** со всем содержимым `dist/`, **исключая** директорию `components/`:

```
artifact/
  └── main.zip
       ├── module1/
       ├── module2/
       ├── init.xml
       └── ... (всё кроме components/)
```

### 4. Архивирование компонентов

Если в `dist/` присутствует директория `components/`, каждая её поддиректория упаковывается в отдельный архив:

```
dist/
  └── components/
       ├── my-component/
       ├── another-component/
       └── ...

→

artifact/
  ├── main.zip
  ├── my-component.zip
  └── another-component.zip
```

**Обработка:**

- Только директории внутри `components/` архивируются
- Файлы в `components/` пропускаются с предупреждением
- Каждый компонент получает отдельный архив с именем `{component-name}.zip`

## Параметры архивирования

- **Формат:** ZIP
- **Степень сжатия:** максимальная (zlib level 9)
- **Библиотека:** [archiver](https://www.npmjs.com/package/archiver)

## Структура результата

```
project/
  ├── dist/                    # Результат linking
  │   ├── components/
  │   │   ├── component-a/
  │   │   └── component-b/
  │   ├── module1/
  │   └── init.xml
  │
  └── artifact/                # Результат artifact
      ├── main.zip             # Основной архив
      ├── component-a.zip      # Компонент A
      └── component-b.zip      # Компонент B
```

## Примеры использования

### Standalone приложение

```bash
# Сборка
btc build

# Линковка
btc link

# Создание архивов
btc artifact
```

Результат: `artifact/main.zip` с полной структурой приложения.

### Multi-package проект с компонентами

```json
// btconfig.json
{
  "packages": [
    { "name": "backend", "packageType": "standalone" },
    { "name": "component-ui", "packageType": "component" }
  ]
}
```

```bash
btc build
btc link
btc artifact
```

Результат:

- `artifact/main.zip` — backend и общие модули
- `artifact/component-ui.zip` — UI компонент

## Интеграция с CI/CD

Архивы из `artifact/` готовы для:

- Загрузки на платформу WebSoft HCM
- Развертывания через API платформы
- Хранения в artifact registry
- Версионирования релизов

### Пример GitHub Actions

```yaml
- name: Build and create artifacts
  run: |
    npm run build
    npx btc link
    npx btc artifact

- name: Upload artifacts
  uses: actions/upload-artifact@v3
  with:
    name: borisscript-dist
    path: artifact/*.zip
```

## Обработка ошибок

- **Директория dist не найдена:** выводится ошибка, выполнение прерывается
- **Файл в components/:** пропускается с предупреждением
- **Ошибка архивирования:** выводится сообщение об ошибке, выполнение прерывается

## Технические детали

### Реализация

Файл: `btc/src/core/artifact.ts`

Функция: `processArtifact(cwd: string): Promise<void>`

### Зависимости

- `archiver` — создание ZIP архивов
- `@types/archiver` — TypeScript типы

### Архитектура

```typescript
processArtifact()
  ├─ createMainArchive()       // Основной архив
  │   └─ createZipArchive()    // Низкоуровневая утилита
  │
  └─ createComponentArchives() // Архивы компонентов
      └─ createZipArchive()    // Низкоуровневая утилита
```

## См. также

- [Линковка](../guides/linking) — руководство по линковке
- [Архитектура линковки](https://github.com/BorisType/BorisType/blob/main/ref/architecture/linking-system.md) — детали реализации
- [btconfig.json](./btconfig) — конфигурация multi-package проектов
