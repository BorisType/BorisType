# Повтор сбора metadata и инвентаризации

Это PostgreSQL/static collectors, не native HCM semantic probes. Нужен отдельно
предоставленный локальный стенд; vendor файлы и credentials в git не входят.
Идентичность текущего исследования — в [manifest](../observed/source-manifest.json).

## PostgreSQL

Сначала проверить выбранные container/database/user и записать начальное состояние
контейнеров. Не запускать автоматически production или HCM ради этих запросов.
В нашем исследовании поднимался только ранее остановленный PostgreSQL; после
работы он был остановлен. Внешние подключения и пароль для `docker exec psql`
не требовались; на другом стенде использовать его штатный способ аутентификации.

```sh
# Значения ниже — конкретный локальный исследованный стенд.
# Private output directory создать вне git; не публиковать полный schema dump.
mkdir -m 700 /tmp/hcm-storage-evidence
docker exec -i boristype-c-runtime-net9-postgres-1 \
  psql -X -qAt -v ON_ERROR_STOP=1 -U root -d WTDB \
  < refs/research/platform-storage/probes/schema.sql \
  > /tmp/hcm-storage-evidence/schema.json
```

`schema.sql` читает pg_catalog/information_schema: таблицы, столбцы, PK/FK,
индексы, размеры и estimates. `estimated_rows` не является точным COUNT.
Проверить фактическую schema перед следующими двумя запросами: они используют
конкретные `dbo."(spxml_...)"` таблицы и поля HCM.

Заменить `schema.sql` и имя output на:

- [registrations.sql](registrations.sql): whitelist полей registration и точные
  определения FK; без `SELECT *` и XML/blob payloads.
- [storage-counts.sql](storage-counts.sql): опциональный COUNT реестра и агрегат
  blobs по двум известным roots/расширению. Индивидуальные ID/URL не выводятся.

Все три файла используют `REPEATABLE READ READ ONLY`, statement timeout 20 s,
lock timeout 2 s. Каждый файл — своя транзакция; для общей точки времени нужен
отдельный согласованный snapshot. COUNT может читать много строк; timeout —
ограничение, а не причина автоматически увеличивать нагрузку/снимать его.
Client timeout сам по себе не доказывает прекращение запроса.

Фактический запуск 2026-11-11: все три collectors вернули валидный JSON и exit 0;
1148 registrations совпали с первым snapshot, aggregates — 27 592 registry rows,
1725 blobs. Два набора raw outputs идентифицированы hashes в manifest и оставлены
приватными. При публикации переносить только пересчитанные summary/примеры без
данных объектов, секретов и локальных административных параметров.

## Файлы остановленного контейнера

1. Через ограниченный `docker inspect` зафиксировать image ID, state и destinations
   mounts. Не сохранять целиком inspect/env: там могут находиться credentials.
2. Инвентаризировать tar stream `docker export` без запуска HCM. Оставлять только
   обычные файлы под `/WebsoftServer`, собирать relative path, size и suffix.
   Это root filesystem контейнера вместе с writable layer, не чистый image.
3. Снять inventory каждого mount отдельно. Здесь использовался временный container
   с `--volumes-from <hcm-container>:ro`, без сети, без entrypoint HCM; читались
   только filesystem metadata. Helper после сбора удалить.
4. Перед объединением исключить из export все пути под mount destinations;
   добавить volume records. Не суммировать overlapping пути дважды и не считать
   пустоту export доказательством пустоты volume.
5. Выборочные source файлы копировать в private directory и считать SHA256
   исходных bytes. Чтение с перекодировкой не должно менять hashed original.
   Содержимое бизнес-документов, logs, binary ресурсов для этой карты не нужно.
6. Сохранить агрегаты по top-level root/extension и выбранные source locators.
   Сверить итог: export 21 529 + mounts 2515 − masked 0 = 24 044 regular files.
   Восстановить первоначальное состояние запуска контейнеров.

Это методика инвентаризации, не переносимый deployment script. Доступные tools,
mounts и layout зависят от стенда. Повтор на другой установке должен выдавать
собственные наблюдения, а не «подгонять» результат к указанным counts.
