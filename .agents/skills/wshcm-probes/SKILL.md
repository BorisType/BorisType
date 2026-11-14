---
name: wshcm-probes
description: Run bounded BorisScript semantic probes on an existing local WebSoft HCM Docker C-runtime stand using the repository ws-client. Use for native runtime checks of generated TS-to-BS code, not production servers or stand deployment.
---

# Проверка BorisScript на локальном C-рантайме

Используй существующий `packages/ws-client`: `WshcmClient.initialize()` проверяет
авторизацию, `createEvaluator()` создаёт временную библиотеку для `eval` через SOAP.
Для повторяемого запуска есть [scripts/run-probe.mjs](scripts/run-probe.mjs).

## Найти и проверить стенд

В текущем окружении стенд расположен **вне репозитория**:

- `~/workspace/wshcm-stand` — compose, приватный `.env`, конфигурация, результаты;
- `~/workspace/wshcm-docker` — отдельный upstream-репозиторий;
- данные — в Docker volumes. Дистрибутивы, пароли и vendor-код не добавлять в git.

Это сведения о текущем стенде, не гарантия наличия этих путей в другом окружении.
Начни с `docker ps` и локального README стенда. На момент проверки 2026-10-17:
проект `boristype-c-runtime`, сервисы `wt` и `postgres`, образ
`websoft/hcm:2025.1.1333`, PostgreSQL 16.15; nginx/MSSQL не используются.

```sh
docker compose -f ~/workspace/wshcm-stand/compose.yml ps
docker logs --tail 30 boristype-c-runtime-wt-1
curl --max-time 5 -H 'Host: wt:80' http://127.0.0.1:18080/default
docker inspect boristype-c-runtime-wt-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
```

Не считать `Server started` готовностью: первый старт может занимать 10–20 минут.
Нужны HTTP-ответ, успешная авторизация и SOAP smoke `2 + 2 → 4`.
Если стенд отсутствует или остановлен, сообщить об этом; этот скилл сам по себе
не поручает скачивать дистрибутив, разворачивать или перенастраивать сервисы.

## Запустить ограниченную пробу

1. Прочитать пробу, проверить побочные эффекты и конечность циклов. Для потенциально
   зависающего кода сначала добавить независимый счётчик/guard. HTTP timeout **не
   отменяет** выполнение на сервере. Не проверять заведомо бесконечный comma-update
   `for` без guard; не запускать непроверенные тесты массово/параллельно.
2. Если `packages/ws-client/build/index.js` отсутствует или не соответствует исходникам,
   собрать: `pnpm --filter @boristype/ws-client build` из корня репозитория.
3. Указать текущий IP контейнера, порт 80 и локальные учётные данные через environment.
   У этого изолированного стенда исходный логин/пароль `user1/user1`; не предполагать
   их для другого сервера. Не выводить содержимое `.env` или полный `compose config`.
4. Выполнить отдельный запуск на каждый файл; runner проверит smoke, создаст новый
   evaluator и вызовет `close()` в `finally`. Ошибка очистки — тоже ошибка запуска.

Пример для подготовленной expression-пробы (подставить **текущий** IP):

```sh
NODE_USE_ENV_PROXY=0 WSHCM_HOST=<container-IP> WSHCM_PORT=80 \
  WSHCM_USER=user1 WSHCM_PASSWORD=user1 \
  node .agents/skills/wshcm-probes/scripts/run-probe.mjs \
  packages/bt-ir/build/semantic/expressions/prototypes/BtExpressionShapeProbe.js \
  --message-result result --expect 'OK: 6/6'
```

В этом sandbox включён Node environment proxy: для прямого container-IP отключить
его **только на запуск** (`NODE_USE_ENV_PROXY=0`) или корректно настроить NO_PROXY.
IP может меняться. Через опубликованный `18080` нужен `Host: wt:80`, но текущий
публичный API ws-client не позволяет задать этот заголовок: использовать прямой
IP:80, а не менять клиент или hosts-каталог ради пробы.

Runner принимает готовый BS, а не TS. Без `--message-result` код передаётся в
`Evaluator.eval()` без изменений: результат должен возвращаться через `return`
или подходящее выражение. Флаг `--message-result result` явно заменяет только
завершающее `MESSAGE = result;` на `return result;`, не оборачивает функции.
`--check` проверяет аргументы/адаптацию и печатает хеши без обращения к стенду.
`--expect` сравнивает результат со строкой **строго**, без приведения типов.

## Интерпретация результатов

- Это **C-runtime через eval внутри временной библиотеки**, не JS-интерпретатор
  из `main.js` и не доказательство эквивалентности всем carrier-ам.
- У библиотек HCM есть v1/v2 и XML/JS-формы. Их точная семантика здесь не исследована.
  Попытка превратить shape-пробу в напрямую вызываемый SOAP-метод библиотеки дала
  `a not defined` в `add(a,b)`, тогда как через evaluator обе пробы прошли 6/6.
  Причина не установлена; не объявлять это багом TS→BS или общим запретом библиотек.
  Не использовать смешанный запуск library/eval как доказательство изоляции.
- Отдельный evaluator на файл уменьшает переиспользование определений функций,
  но не изолирует глобальное состояние всего сервера/БД. Пробы должны быть самодостаточными.
- При SOAP `Internal Server Error` смотреть ограниченный хвост `docker logs`:
  клиент может не показывать реальную ошибку и строку BS. Не копировать vendor-код.
- На этом стенде пул Npgsql 100 исчерпывался при PostgreSQL max_connections=300.
  В приватной конфигурации уже установлен `Maximum Pool Size=250`. Форма
  `Max Pool Size` отвергалась драйвером. При повторении проверить логи и соединения,
  не увеличивать лимиты и не перезапускать сервер вслепую.
- При timeout остановить серию проб, проверить состояние сервера и очистку.
  Не повторять потенциально продолжающийся вызов автоматически. Если `close()` не
  удался, проверить оставшиеся `unsafe_eval_*.bs`; не удалять чужие файлы по маске.

Записывать версию/образ рантайма, carrier, SHA256 исходного и переданного кода,
точную адаптацию, actual/expected и статус очистки. Разовый SOAP wall-time не является
бенчмарком: производительность и стоимость сгенерированного кода исследовать отдельно.
На первом стенде обе expression-пробы (`Shape` и `Inline`) дали `OK: 6/6` через eval.
В отчёт исследования можно добавлять эти сведения, но не артефакты самого стенда.
