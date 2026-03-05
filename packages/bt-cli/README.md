# btc — BorisType Compiler

Транспилятор TypeScript → BorisScript для платформы WebSoft HCM.

Использует [bt-ir](../bt-ir/) для emit: TypeScript Compiler API создаёт Program с `noEmit: true`, а кодогенерация выполняется через `compileSourceFile()` из bt-ir.

## CLI-команды

```
btc init          # Создать проект (scaffold)
btc build         # Однократная сборка
btc dev           # Watch mode с инкрементальной компиляцией и авто-линковкой
btc link          # Линковка модулей в dist/
btc push          # Деплой dist/ на сервер WSHCM
btc artifact      # Создание артефакта для развёртывания
```

## Структура `src/`

```
src/
├── index.ts                  # Точка входа (CLI bootstrap)
├── cli/                      # Тонкие обёртки над commander
│   ├── index.ts              # Регистрация команд
│   └── commands/             # Обработчики CLI-команд
├── core/                     # Вся бизнес-логика
│   ├── config.ts             # Чтение tsconfig / btconfig
│   ├── logger.ts             # Re-export логгера
│   ├── utils/                # Общие утилиты
│   │   ├── logger.ts         # Logger (singleton)
│   │   ├── properties.ts     # Парсер .properties файлов
│   │   └── xml.ts            # Общие XML builder/parser
│   ├── building/             # Компиляция TS → BS
│   │   ├── compiler.ts       # Program + emit через bt-ir
│   │   ├── compile-mode.ts   # Определение режима файла (module/script)
│   │   ├── coordinator.ts    # Координатор dev mode (multi-package)
│   │   ├── files.ts          # Копирование non-TS файлов
│   │   ├── output.ts         # Пост-обработка вывода
│   │   └── types.ts          # BuildContext, BuildResult, BtcCompileOptions
│   ├── linking/              # Сборка dist/ из модулей
│   │   ├── index.ts          # Pipeline: resolve → link → finalize
│   │   ├── parsers.ts        # Парсеры PackageInfo
│   │   ├── executables.ts    # Сбор executables
│   │   ├── dependencies.ts   # Дерево зависимостей
│   │   ├── cache.ts          # Кэширование линковки
│   │   ├── context.ts        # LinkingContext
│   │   ├── types.ts          # PackageInfo, LinkingOptions
│   │   ├── linkers/          # Линковщики по типу пакета
│   │   ├── generators/       # Генерация api_ext.xml, init.xml и т.д.
│   │   └── utils/            # URL, copy, node_modules
│   ├── pushing/              # Деплой на сервер WSHCM
│   │   ├── session.ts        # DeploySession (с retry/reconnect)
│   │   ├── upload.ts         # Загрузка файлов
│   │   ├── config.ts         # Чтение btconfig.properties
│   │   ├── queue.ts          # DebouncedPushQueue для dev mode
│   │   └── reinit.ts         # Реинициализация на сервере
│   └── artifacting/          # Создание архивов для деплоя
```

## Сборка

```bash
npm run build    # tsc → build/
```

Требуется Node.js 22+.
