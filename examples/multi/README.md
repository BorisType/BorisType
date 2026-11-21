# Пример многопакетного проекта

Пример собирает BorisScript backend и упаковывает его вместе со статическим
HTML. Состав поставки задаёт [btconfig.json](btconfig.json).

Из корня репозитория после установки зависимостей и сборки CLI:

```sh
pnpm -C examples/multi build
pnpm -C examples/multi link
```

Готовый backend попадает в `dist/wt/backend/`, HTML — в `dist/wt/frontend/`.
Выбор файлов для линковки описан в [справочнике btconfig.json](../../docs/reference/btconfig.md).
