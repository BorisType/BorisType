# Пример с одним пакетом

Пример компилирует `src/index.ts` и копирует готовый файл в каталог,
заданный `ws:root` в [package.json](package.json).

Из корня репозитория после установки зависимостей и сборки CLI:

```sh
pnpm -C examples/single build
pnpm -C examples/single link
```

Линковка помещает `build/index.js` в `dist/wt/myapp/index.js`. Этот пример
показывает подготовку файлов. Для автоматического запуска на HCM предусмотрите
собственную инициализацию пакета.

[Документация по линковке](../../docs/guides/linking.md)
