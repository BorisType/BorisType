# Локальный WebSoft HCM с нуля

Эта инструкция создаёт отдельный тестовый стенд **WebSoft HCM 2025.2.1333 +
PostgreSQL 16** в новом окружении. Существующие контейнеры, файлы другого
workspace и checkout BorisType для установки не нужны. Все необходимые
конфигурационные файлы создаются командами ниже; закрытый дистрибутив WebSoft
получается отдельно.

Команды рассчитаны на **Bash в Linux amd64** и локальный Docker daemon.
На Windows используйте Linux-окружение с Docker, например WSL2. Установка на
ARM, удалённый Docker daemon и перенос существующей БД здесь не проверены.

## 1. Подготовить окружение

Нужны Docker Engine с Compose v2, Node.js, `curl`, `unzip`, `sha256sum`.
Для Node в BorisType используйте версию из `.node-version`; на момент написания
это 24.22.2. Настройка ниже использует только встроенные модули Node, `npm install`
не требуется.

Docker должен иметь доступ хотя бы к 4 CPU и 6 GiB RAM: HCM ограничен 4 GiB,
PostgreSQL — 1 GiB, остальная память нужна окружению. Зарезервируйте около
15 GiB свободного диска под архив, распакованный образ, PostgreSQL и логи.
Это запас для установки, а не измеренный минимальный размер.

```bash
docker info --format 'OS={{.OSType}} Arch={{.Architecture}} CPUs={{.NCPU}} RAM={{.MemTotal}}'
docker compose version
node --version
curl --version
unzip -v
```

Создайте **новый** каталог вне рабочего проекта. Если он уже существует,
выберите другое имя, чтобы не перезаписать чужую конфигурацию.

```bash
mkdir -p "$HOME/workspace"
mkdir "$HOME/workspace/wshcm-stand-net9"
cd "$HOME/workspace/wshcm-stand-net9"
mkdir -p dist wt postgres
```

Все следующие команды выполняются из этого каталога.
Имя Compose project — `boristype-c-runtime-net9`. Если в этом же Docker уже
есть другой проект с таким именем или занят порт 18080, выберите уникальные
`name:` и внешний порт в Compose ниже.

## 2. Получить дистрибутив и SQL-инициализацию

Получите разрешённый вам дистрибутив WebSoft у поставщика или из предоставленной
владельцем стенда ссылки. Нужны **два файла** этой сборки:

```text
dist/hcm_2025.2.1333.tar.gz
dist/WT_directory.zip
```

`hcm_2025.2.1333.tar.gz` — архив Docker-образа, который загружается командой
`docker load`. Сам образ в git отсутствует. Для этой инструкции не нужно
собирать Dockerfile или скачивать HCM через `docker pull`.

Контрольные суммы экземпляров, на которых был установлен исходный стенд:

```bash
sha256sum dist/hcm_2025.2.1333.tar.gz dist/WT_directory.zip
```

```text
4853b98fa712287e08401e8477e879c2160d0307f5981753227908fb0021009a  dist/hcm_2025.2.1333.tar.gz
f530b3e59685fcabf8114de5efd31843c41dc3ec9653eab0e34b03bdb361598e  dist/WT_directory.zip
```

Это hashes локальных экземпляров, а не независимая подпись поставщика.
Если архив отличается, сначала установите его версию: настройки для другой
сборки автоматически не подтверждены.

Скачайте PostgreSQL init script из закреплённой ревизии открытого репозитория
[BorisType/wshcm-docker](https://github.com/BorisType/wshcm-docker/tree/2c65233cd4caa42e376e1952e4a7340fc46d0bd4):

```bash
curl --noproxy '*' -fL --retry 2 \
  'https://raw.githubusercontent.com/BorisType/wshcm-docker/2c65233cd4caa42e376e1952e4a7340fc46d0bd4/misc/postgres/create_db.sql' \
  -o postgres/create_db.sql
test -s postgres/create_db.sql
```

Если внешний интернет доступен только через proxy, уберите `--noproxy '*'`
именно из этой команды скачивания. Для локальных HTTP-проверок ниже proxy
следует обходить.

## 3. Создать конфигурацию

Создайте `compose.yml`:

```bash
cat > compose.yml <<'YAML'
name: boristype-c-runtime-net9

services:
  postgres:
    image: postgres:16
    pull_policy: never
    command: [postgres, -c, max_connections=300]
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Run configure.mjs first}
      POSTGRES_DB: WTDB
    volumes:
      - type: bind
        source: ./postgres/create_db.sql
        target: /docker-entrypoint-initdb.d/create_tables.sql
        read_only: true
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 10s
      timeout: 3s
      retries: 10
      start_period: 10s
    mem_limit: 1g
    memswap_limit: 1g
    cpus: 2
    networks: [stand]

  wt:
    image: websoft/hcm:2025.2.1333
    pull_policy: never
    working_dir: /WebsoftServer
    entrypoint: /tmp/wt/start.sh
    tty: true
    stdin_open: true
    environment:
      SQL_PASSWORD: ${POSTGRES_PASSWORD:?Run configure.mjs first}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:18080:80"
    volumes:
      - type: bind
        source: ./wt
        target: /tmp/wt
        read_only: true
      - wt-data:/WebsoftServer/wt_data
      - wt-webtutor:/WebsoftServer/wt/web/webtutor
      - wt-logs:/WebsoftServer/Logs
      - wt-idxs:/WebsoftServer/ft-idx
      - wt-apps:/WebsoftServer/applications
    mem_limit: 4g
    memswap_limit: 4g
    cpus: 4
    networks: [stand]

networks:
  stand:

volumes:
  postgres-data:
  wt-data:
  wt-webtutor:
  wt-logs:
  wt-idxs:
  wt-apps:
YAML
```

PostgreSQL использует пользователя `root` и БД `WTDB`: init script содержит
`OWNER TO root`. Его не нужно запускать вручную после `compose up`: образ
PostgreSQL выполнит его при инициализации пустого data volume.

Создайте `configure.mjs`. Он извлечёт шаблоны **из нового дистрибутива**, включит
SQL storage для `wt_data`/`trash` и создаст приватный `.env` со случайным паролем.
Пароль уже существующего `.env` сохраняется.

```bash
cat > configure.mjs <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const wt=path.join(root,'wt');fs.mkdirSync(wt,{recursive:true});
const env=path.join(root,'.env');
if(!fs.existsSync(env))fs.writeFileSync(env,'POSTGRES_PASSWORD='+randomBytes(24).toString('hex')+'\n',{mode:0o600});
fs.chmodSync(env,0o600);
const vendor=name=>execFileSync('unzip',['-p',path.join(root,'dist/WT_directory.zip'),
 'WT_directory/docker/WebSoftServerForDocker/'+name],{encoding:'utf8'}).replaceAll('\r\n','\n');
let ini=vendor('xHttp.ini');
// Preserve the net9 platform/lib paths from the new vendor template.
ini=ini.replace('DOTNETCORE-DEBUG: 0','DOTNETCORE-DEBUG: 1')
 .replace('#ALLOW-SQL-REMOTE-QUERIES: 1','ALLOW-SQL-REMOTE-QUERIES: 1')
 .replace('#DB-STORE-HOOK: wt_data x-local://platform/storage/spxml/sx_store_sql.xml','DB-STORE-HOOK: wt_data x-local://platform/storage/spxml/sx_store_sql.xml')
 .replace('#DB-STORE-HOOK: trash x-local://platform/storage/spxml/sx_store_sql.xml','DB-STORE-HOOK: trash x-local://platform/storage/spxml/sx_store_sql.xml');
fs.writeFileSync(path.join(wt,'xhttp.ini'),ini);
let xml=vendor('spxml_unibridge_config.xml');
for(const [key,value]of Object.entries({ConnectionString:'Server=postgres;Maximum Pool Size=250',
 DBType:'PostgreSQL',Username:'root',Password:'$SQL_PASSWORD',Database:'WTDB',TrashDatabase:''})){
 const pattern=new RegExp('(<add key="'+key+'" value=")[^"]*("\\s*/>)');
 if(!pattern.test(xml))throw Error('Missing vendor config key: '+key);
 xml=xml.replace(pattern,(_,a,b)=>a+value+b);
}
fs.writeFileSync(path.join(wt,'spxml_unibridge_config.xml'),xml);
console.log('Prepared net9 vendor-based templates and private credentials; no old database/config copied.');
JS
```

Создайте `wt/start.sh`:

```bash
cat > wt/start.sh <<'BASH'
#!/bin/bash
set -euo pipefail
cd /WebsoftServer
# This build only accepted the bundled demo license after placing it in AppDir.
# Preserve any existing root-level license; this stand uses the vendor demo.
if ! compgen -G '/WebsoftServer/*.xfpx' > /dev/null; then
    cp /WebsoftServer/custom/license/demo_license.xfpx /WebsoftServer/demo_license.xfpx
fi
cp /tmp/wt/xhttp.ini /WebsoftServer/xHttp.ini
cp /tmp/wt/spxml_unibridge_config.xml /WebsoftServer/spxml_unibridge_config.xml
sed -i "s/\$SQL_PASSWORD/$SQL_PASSWORD/g" /WebsoftServer/spxml_unibridge_config.xml
if [ ! -f /fifd ]; then
    touch /WebsoftServer/fifd /fifd
fi
exec ./xhttp.out
BASH
chmod +x wt/start.sh
node configure.mjs
```

Скрипт запуска копирует комплектную `custom/license/demo_license.xfpx` в корень
`/WebsoftServer`, если там ещё нет лицензии. На исходном стенде эта сборка без
такого размещения писала `License files not found` и не завершала запуск.
Содержимое и проверка лицензии не изменяются. Нужна действующая лицензия для
вашего дистрибутива; если комплектная истекла, требуется лицензия поставщика.

Результирующая структура:

```text
wshcm-stand-net9/
  compose.yml
  configure.mjs
  .env
  dist/
    hcm_2025.2.1333.tar.gz
    WT_directory.zip
  postgres/
    create_db.sql
  wt/
    start.sh
    xhttp.ini
    spxml_unibridge_config.xml
```

Не добавляйте `.env`, дистрибутив и данные стенда в git.

## Что именно меняется в ini и XML

`configure.mjs` берёт `xHttp.ini` **из `WT_directory.zip` этой же сборки**.
Так сохраняются вендорские пути и остальные настройки: например,
`DOTNETLIBS-PATH` и путь SQL hook для .NET 9 отличаются от старой установки на .NET 6.
Скрипт вносит четыре явные правки:

```ini
# Было в дистрибутиве:
DOTNETCORE-DEBUG: 0
#ALLOW-SQL-REMOTE-QUERIES: 1
#DB-STORE-HOOK: wt_data x-local://platform/storage/spxml/sx_store_sql.xml
#DB-STORE-HOOK: trash x-local://platform/storage/spxml/sx_store_sql.xml

# После настройки:
DOTNETCORE-DEBUG: 1
ALLOW-SQL-REMOTE-QUERIES: 1
DB-STORE-HOOK: wt_data x-local://platform/storage/spxml/sx_store_sql.xml
DB-STORE-HOOK: trash x-local://platform/storage/spxml/sx_store_sql.xml
```

`#` в начале строки — комментарий. Три `ini.replace(...)` убирают его
у конкретных строк SQL-настроек. Ещё одна замена включает основной
`DOTNETCORE-DEBUG`. Остальные вендорские настройки сохраняются.

| Правка                        | Для чего она нужна                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB-STORE-HOOK: wt_data ...`  | Выбирает SQL storage hook для основного хранилища документов WebSoft. Одного запущенного PostgreSQL и строки подключения недостаточно для этой настройки.                                                                    |
| `DB-STORE-HOOK: trash ...`    | Подключает SQL storage hook для логической корзины. Здесь она использует ту же БД `WTDB`.                                                                                                                                    |
| `ALLOW-SQL-REMOTE-QUERIES: 1` | Включает прямые SQL-запросы через WebSoft. Оставлен как настройка исследовательского стенда для SQL-инструментов; это отдельная возможность, а не переключатель хранилища. Для проверки через `docker ... psql` он не нужен. |

`DOTNETCORE-DEBUG: 1` включён для исследовательского стенда. Это общий
переключатель, необходимый для работы `DOTNETCORE-DEBUG-*`; подробные флаги
логирования и прерывания по ошибке эта настройка сама по себе не включает.
Они сохраняют вендорские значения. В частности, `DOTNETCORE-DEBUG-UNHANDLED`
в документации описан как прерывание по ошибке, поэтому автоматически его
не включаем. `DOTNETCORE-XHTTP-DEBUG` — отдельный переключатель middleware;
он остаётся `0`.

`CODE-CACHE: 1` и `CODE-CACHE-MIN-SIZE: 64` уже включены в оригинальном образе.
По документации `CODE-CACHE` сохраняет скомпилированный код, полученный через
`eval`, `inplaceeval`, `evalcodepage`, `evalcodepageurl`: при повторном исходнике
он ищет готовый код по хешу и позволяет пропустить разбор/компиляцию. Выполнение
скрипта происходит заново; результаты вычислений не кэшируются. `MIN-SIZE`
задаёт порог размера исходника. Хитрейт, пределы памяти и ускорение на наших
пробах не измерялись.

Если нужны только PostgreSQL как хранилище и обычные операции документов,
обязательность `ALLOW-SQL-REMOTE-QUERIES: 1` из этого рецепта не следует.
В этой инструкции он включён для соответствия существующему исследовательскому
стенду. Его можно оставить закомментированным, удалив из цепочки замен только
строку для `ALLOW-SQL-REMOTE-QUERIES`.
Отключённый вариант отдельно на текущем стенде не проверялся.

Строку `CATALOG-STORAGE: xdb` не меняем. В документации она описана как тип
структуры каталогов **в режиме локального XML-хранилища**. Её наличие не означает,
что активные SQL hooks игнорируются: на нашем стенде запись документа через
`Save()` фактически обновляет PostgreSQL. Параметр `ALLOW-SERVER-EVAL: 0` тоже
остаётся вендорским; SOAP-проба через временную библиотеку прошла с ним.

`replaceAll('\r\n', '\n')` только нормализует переводы строк Windows → Unix.
Это не меняет кодировку и не переключает хранилище. Необходимость LF именно
для INI parser не утверждается.

Второй файл, `spxml_unibridge_config.xml`, задаёт параметры выбранного SQL provider:

| Ключ                    | Значение в стенде                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ConnectionString`      | `Server=postgres;Maximum Pool Size=250`: DNS-имя сервиса внутри сети Compose и лимит пула.                      |
| `DBType`                | `PostgreSQL`.                                                                                                   |
| `Username` / `Database` | `root` / `WTDB`, согласованы с контейнером PostgreSQL и init script.                                            |
| `Password`              | Сначала строка `$SQL_PASSWORD`; `wt/start.sh` подставляет фактический пароль из environment перед запуском HCM. |
| `TrashDatabase`         | Пустая строка: отдельная БД для корзины не задаётся.                                                            |

`xml.replace(...)` меняет только `value` у этих шести `<add key="...">`,
оставляя остальные вендорские параметры. Для отсутствующего XML key скрипт
завершается ошибкой. INI-замены используют точное совпадение и при другом
шаблоне могли бы ничего не заменить — поэтому версия и hashes дистрибутива
закреплены. Этот скрипт не является универсальным редактором произвольных версий HCM.

При старте `wt/start.sh` копирует подготовленные файлы из bind mount `/tmp/wt`
в `/WebsoftServer/xHttp.ini` и `/WebsoftServer/spxml_unibridge_config.xml`.
Поэтому правки только внутри контейнера будут перезаписаны при следующем старте:
меняйте исходник `wt/xhttp.ini` и перезапускайте `wt`. Повторный
`node configure.mjs` заново создаёт эти два файла из шаблонов.

Назначение настроек сверено с [описанием xHttp.ini](https://wshcm-docs.boristype.dev/news/monolith/6747986263544912377.html),
фактическими шаблонами дистрибутива и проверенным SQL-сохранением документа.
Точные пути и поведение относятся к указанной сборке.

## 4. Загрузить образы и запустить

```bash
docker load -i dist/hcm_2025.2.1333.tar.gz
docker image inspect websoft/hcm:2025.2.1333 --format '{{.Os}}/{{.Architecture}}'
docker pull postgres:16

# Проверить конфиг, не печатая подставленные пароли.
docker compose config --quiet

docker compose up -d
docker compose ps
docker compose logs --tail 80 wt
```

В Compose стоит `pull_policy: never`: HCM уже загружен локально, PostgreSQL
заранее скачан. Контейнеры будут называться:

```text
boristype-c-runtime-net9-postgres-1
boristype-c-runtime-net9-wt-1
```

Первичная установка может занимать **10–20 минут**: WebSoft создаёт каталоги,
накатывает пакеты и импортирует демоданные. `Server started` само по себе ещё
не подтверждает готовность. Следите за логами, не перезапускайте сервер каждые
несколько секунд.

## 5. Проверить HTTP и авторизацию

```bash
curl --noproxy '*' --max-time 10 \
  -H 'Host: wt:80' \
  -o /dev/null -sS -w 'HTTP %{http_code}\n' \
  http://127.0.0.1:18080/default
```

Ожидается `HTTP 200`. Если установка ещё продолжается, запрос может завершиться
по timeout. Проверьте свежие логи и повторите запрос позднее.

Проверьте демоучётную запись:

```bash
curl --noproxy '*' --max-time 15 \
  -H 'Host: wt:80' \
  -u user1:user1 \
  -o /dev/null -sS -w 'HTTP %{http_code}\n' \
  http://127.0.0.1:18080/home
```

Ожидается `HTTP 200`. `user1/user1` — учётная запись конкретного демодистрибутива;
на другой БД или после смены пароля используйте актуальные credentials.

Заголовок `Host: wt:80` нужен потому, что WebSoft проверяет разрешённые пары
host/port. Этот минимальный стенд не включает nginx. Для интерактивной работы
в браузере на другом внешнем порту потребуется настроить разрешённый узел
WebSoft либо reverse proxy; один URL `localhost:18080` этого не обеспечивает.

Если команды агента выполняются в отдельном контейнере, его `127.0.0.1` может
отличаться от хоста Docker. В Linux можно проверить прямой IP HCM, если сеть
окружения позволяет к нему подключиться:

```bash
stand_ip="$(docker inspect boristype-c-runtime-net9-wt-1 \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
curl --noproxy '*' --max-time 10 -H 'Host: wt:80' \
  -o /dev/null -sS -w 'HTTP %{http_code}\n' "http://$stand_ip/default"
```

Недоступность container IP в Docker Desktop или другой изолированной сети
требует маршрута к хосту Docker. Это не повод пересоздавать БД.

## 6. Убедиться, что PostgreSQL содержит данные WebSoft

Выполните прямые SQL-запросы в контейнере БД:

```bash
docker compose exec -T postgres psql -X -U root -d WTDB -v ON_ERROR_STOP=1 <<'SQL'
SELECT table_schema, count(*) AS tables
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
GROUP BY table_schema;

SELECT count(*) AS objects FROM dbo."(spxml_objects)";
SELECT count(*) AS employees FROM dbo.collaborators;

SELECT c.id::text, c.fullname,
       (xpath('/collaborator/lastname/text()', d.data))[1]::text AS lastname
FROM dbo.collaborators c
JOIN dbo.collaborator d USING (id)
ORDER BY c.id
LIMIT 5;
SQL
```

После завершения установки в `dbo` должны быть таблицы WebSoft и импортированные
документы. На существующем стенде 2026-11-14 было 1153 таблицы, 27 592 объекта
и 59 сотрудников. Эти числа — пример состояния демобазы, а не обязательное
точное условие для каждого нового запуска.

`dbo.collaborator.data` содержит полный XML сотрудника; `dbo.collaborators`
содержит его каталожную проекцию. На текущем стенде изменение `lastname` через
`OpenDoc → Save()` было подтверждено прямым SQL и в XML, и в `fullname` каталога;
после проверки исходная фамилия восстановлена.

## 7. Дополнительно: SOAP evaluator через npm-пакет

Checkout и сборка BorisType для этого не нужны. На 2026-11-14 npm dist-tag
`latest` указывает на `0.1.0-alpha.2`, а `next` — на более новую `0.1.0-alpha.4`.
Ниже версия закреплена явно; пакет требует Node.js >= 24.

Из каталога стенда установите клиент в отдельную папку:

```bash
mkdir -p smoke
npm install --prefix ./smoke @boristype/ws-client@0.1.0-alpha.4

cat > smoke/soap-smoke.mjs <<'JS'
import { WshcmClient } from '@boristype/ws-client';
const client = new WshcmClient({
  overHttps: false, host: process.env.WSHCM_HOST, port: 80,
  username: process.env.WSHCM_USER, password: process.env.WSHCM_PASSWORD,
  requestTimeout: 15000,
});
await client.initialize();
const evaluator = client.createEvaluator();
try {
  await evaluator.initialize();
  const actual = await evaluator.evalExpr('2 + 2');
  if (actual !== 4) throw new Error('SOAP smoke failed: ' + actual);
  console.log('OK: authenticated SOAP, 2 + 2 = 4');
} finally {
  if (!await evaluator.close()) throw new Error('Evaluator cleanup unconfirmed');
  console.log('OK: evaluator cleanup confirmed');
}
JS

stand_ip="$(docker inspect boristype-c-runtime-net9-wt-1 \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"

NODE_USE_ENV_PROXY=0 WSHCM_HOST="$stand_ip" \
  WSHCM_USER=user1 WSHCM_PASSWORD=user1 \
  node smoke/soap-smoke.mjs
```

Ожидаются обе строки `OK`. Проба проверяет авторизацию, SOAP arithmetic и удаляет
временную библиотеку. Используется прямой IP:80: у проверенного npm-пакета
в `WshcmClientOptions` нет отдельного параметра для `Host: wt:80`, нужного
опубликованному порту. IP может меняться. Сама проба была выполнена именно
с npm-пакетом `0.1.0-alpha.4`, без импорта из локального checkout.

## Управление и сохранность данных

Из каталога стенда:

```bash
docker compose ps
docker compose logs --tail 80 wt

# Остановить по необходимости, сохранив контейнеры и volumes.
docker compose stop

# Возобновить существующие контейнеры.
docker compose start
```

После установки оставьте стенд работающим, если пользователь не просил остановить.
Не используйте `docker compose down -v`: команда удалит volumes с БД и данными.
Даже обычный `down` или `up --force-recreate` удаляет writable layer контейнера:
в этом минимальном конфиге не все vendor-файлы находятся в volumes. Например,
дополнительно установленная .NET DLL вне смонтированных каталогов при
пересоздании исчезнет. Перед пересозданием сохраните такие изменения отдельно.

Volumes хранят PostgreSQL, `wt_data`, `wt/web/webtutor`, логи, FT-индексы и applications.
Это не полная схема резервного копирования всех файлов WebSoft.

## Если установка не проходит

- `image ... not found` — проверьте успешный `docker load` и тег
  `websoft/hcm:2025.2.1333`; не берите устаревший тег из vendor `docker.run`.
- `Run configure.mjs first` — выполните `node configure.mjs` в каталоге стенда.
- PostgreSQL unhealthy — `docker compose logs --tail 80 postgres`. Init script
  выполняется только на пустом volume. Не удаляйте существующий volume ради
  повторного запуска init script без решения о сохранении данных.
- `License files not found` — проверьте `wt/start.sh` и наличие комплектной
  лицензии. Ошибка об истечении/недействительности требует действующей лицензии.
- HTTP timeout при первом запуске — смотрите `docker compose logs --tail 80 wt`;
  дайте закончиться установке пакетов, затем повторите проверку HTTP.
- `Current host ... is not found` — проверяйте `Host: wt:80`, завершение импорта
  и каталог разрешённых узлов. В начале установки кэш узлов ещё может быть не готов.
- Порт 18080 занят — измените левую часть `127.0.0.1:18080:80` в Compose и URL
  проверок. Внутренний порт 80 и заголовок `Host: wt:80` остаются прежними.
- Npgsql pool exhausted — проверьте логи и активные соединения. В конфиге уже
  стоят `Maximum Pool Size=250` и PostgreSQL `max_connections=300`. Написание
  `Max Pool Size` эта сборка драйвера отвергала.

## Что проверено

Исходный стенд установлен 2026-11-05 из указанных архивов: Linux amd64,
`websoft/hcm:2025.2.1333`, .NET 9.0.11, PostgreSQL 16. HTTP, авторизация и
SOAP evaluator прошли после установки и обычного перезапуска. 2026-11-14 повторно
проверены HTTP, SOAP, существование и содержимое таблиц, а также сохранение
изменения документа в PostgreSQL с последующим восстановлением фамилии.

Команды создания конфигурации из этой страницы проверяются отдельно от
установки: проверка Compose и совпадения с настройками исходного стенда
не означает, что была выполнена ещё одна полная установка на чистой машине.
